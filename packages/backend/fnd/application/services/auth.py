"""Authentication, device registration, sessions, and RBAC services."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
import hashlib
from secrets import token_urlsafe
from urllib.parse import urlencode
from uuid import uuid4

from packages.backend.fnd.domain.enterprise import (
    AuditAction,
    AuditEvent,
    DeviceRegistration,
    Principal,
    Role,
    TenantContext,
    UserSession,
    new_session,
    require_role,
)
from packages.backend.fnd.ports.enterprise import (
    AuditRepository,
    DeviceRepository,
    SessionRepository,
)


@dataclass(frozen=True)
class OidcConfiguration:
    issuer: str
    client_id: str
    authorization_endpoint: str
    token_endpoint: str
    jwks_uri: str
    redirect_uri: str = "http://127.0.0.1:5173/auth/callback"
    scopes: tuple[str, ...] = ("openid", "profile", "email")


@dataclass(frozen=True)
class OidcAuthorizationRequest:
    authorization_url: str
    state: str
    nonce: str
    code_verifier: str
    code_challenge: str


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    import base64

    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


class ReplayNonceStore:
    def __init__(self) -> None:
        self._used: set[str] = set()

    def consume_once(self, token_id: str) -> None:
        if token_id in self._used:
            raise PermissionError("Token replay was detected.")
        self._used.add(token_id)


class AuthService:
    def __init__(
        self,
        *,
        sessions: SessionRepository,
        devices: DeviceRepository,
        audit: AuditRepository,
        nonce_store: ReplayNonceStore | None = None,
    ) -> None:
        self._sessions = sessions
        self._devices = devices
        self._audit = audit
        self._nonce_store = nonce_store or ReplayNonceStore()

    def build_authorization_request(
        self,
        config: OidcConfiguration,
    ) -> OidcAuthorizationRequest:
        verifier = token_urlsafe(48)
        state = token_urlsafe(32)
        nonce = token_urlsafe(32)
        challenge = pkce_challenge(verifier)
        query = urlencode(
            {
                "response_type": "code",
                "client_id": config.client_id,
                "redirect_uri": config.redirect_uri,
                "scope": " ".join(config.scopes),
                "state": state,
                "nonce": nonce,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            }
        )
        return OidcAuthorizationRequest(
            authorization_url=f"{config.authorization_endpoint}?{query}",
            state=state,
            nonce=nonce,
            code_verifier=verifier,
            code_challenge=challenge,
        )

    def accept_token_id_once(self, token_id: str) -> None:
        self._nonce_store.consume_once(token_id)

    def register_device(
        self,
        *,
        principal: Principal,
        client_type: str,
    ) -> DeviceRegistration:
        device = DeviceRegistration(
            device_id=str(uuid4()),
            user_id=principal.user_id,
            tenant_id=principal.tenant_id,
            client_type=client_type,
        )
        self._devices.save(device)
        self._audit_event(
            principal, AuditAction.DEVICE_REGISTERED, "device", device.device_id
        )
        return device

    def create_session(
        self,
        principal: Principal,
        device_id: str,
        *,
        lifetime: timedelta | None = None,
    ) -> UserSession:
        tenant = TenantContext(principal.tenant_id)
        device = self._devices.get(tenant, device_id)
        if device is None or device.revoked:
            raise PermissionError("Device is not registered or has been revoked.")
        session = new_session(
            principal=principal,
            device_id=device_id,
            lifetime=lifetime or timedelta(hours=8),
        )
        self._sessions.save(session)
        self._audit_event(principal, AuditAction.LOGIN, "session", session.session_id)
        return session

    def authorize(self, principal: Principal, tenant_id: str, role: Role) -> None:
        if Role.SYSTEM_ADMIN not in principal.roles:
            TenantContext(principal.tenant_id).require_same_tenant(tenant_id)
        require_role(principal, role)

    def revoke_session(self, session: UserSession, when: datetime) -> UserSession:
        revoked = UserSession(
            session_id=session.session_id,
            principal=session.principal,
            device_id=session.device_id,
            expires_at=session.expires_at,
            revoked_at=when,
        )
        self._sessions.save(revoked)
        self._audit_event(
            session.principal, AuditAction.LOGOUT, "session", session.session_id
        )
        return revoked

    def _audit_event(
        self,
        principal: Principal,
        action: AuditAction,
        resource_type: str,
        resource_id: str,
    ) -> None:
        self._audit.append(
            AuditEvent(
                event_id=str(uuid4()),
                tenant_id=principal.tenant_id,
                actor_user_id=principal.user_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
            )
        )
