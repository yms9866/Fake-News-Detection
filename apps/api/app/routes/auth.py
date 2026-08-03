"""Authentication and local-session endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from packages.backend.fnd.application.services.auth import (
    AuthSessionBundle,
    LocalSignInCommand,
)
from packages.backend.fnd.domain.errors import AuthenticationError
from packages.contracts.python.analysis_contracts import (
    AuthSessionResponse,
    AuthSignInRequest,
    AuthSignOutResponse,
    AuthUserResponse,
)

from apps.api.app.dependencies import get_container
from apps.api.app.middleware import get_request_id, get_trace_id
from apps.api.app.state import ApiContainer

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/sign-in", response_model=AuthSessionResponse)
def sign_in(
    payload: AuthSignInRequest,
    request: Request,
    container: ApiContainer = Depends(get_container),
) -> AuthSessionResponse:
    assert container.auth_service is not None
    bundle = container.auth_service.sign_in(
        LocalSignInCommand(
            username=payload.username,
            tenant_id=payload.tenant_id,
            client_type=payload.client_type,
        )
    )
    return _session_response(bundle, request, include_token=True)


@router.get("/session", response_model=AuthSessionResponse)
def restore_session(
    request: Request,
    container: ApiContainer = Depends(get_container),
) -> AuthSessionResponse:
    assert container.auth_service is not None
    bundle = container.auth_service.restore(_bearer_token(request))
    return _session_response(bundle, request, include_token=False)


@router.post("/refresh", response_model=AuthSessionResponse)
def refresh_session(
    request: Request,
    container: ApiContainer = Depends(get_container),
) -> AuthSessionResponse:
    assert container.auth_service is not None
    bundle = container.auth_service.refresh(_bearer_token(request))
    return _session_response(bundle, request, include_token=True)


@router.post("/sign-out", response_model=AuthSignOutResponse)
def sign_out(
    request: Request,
    container: ApiContainer = Depends(get_container),
) -> AuthSignOutResponse:
    assert container.auth_service is not None
    container.auth_service.sign_out(_bearer_token(request))
    return AuthSignOutResponse(
        signed_out=True,
        message="You have been signed out.",
        request_id=get_request_id(request),
        trace_id=get_trace_id(request),
    )


def _session_response(
    bundle: AuthSessionBundle,
    request: Request,
    *,
    include_token: bool,
) -> AuthSessionResponse:
    return AuthSessionResponse(
        authenticated=True,
        user=AuthUserResponse(
            user_id=bundle.principal.user_id,
            tenant_id=bundle.principal.tenant_id,
            roles=[role.value for role in bundle.principal.roles],
        ),
        access_token=bundle.access_token if include_token else None,
        expires_at=bundle.session.expires_at,
        request_id=get_request_id(request),
        trace_id=get_trace_id(request),
    )


def _bearer_token(request: Request) -> str:
    value = request.headers.get("Authorization", "")
    scheme, _, token = value.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AuthenticationError("Please sign in to continue.")
    return token.strip()
