export default `
:host {
  all: initial;
}
.fnd-overlay {
  position: fixed;
  z-index: 2147483647;
  right: 16px;
  bottom: 16px;
  width: min(380px, calc(100vw - 32px));
  color: #11181c;
  background: #f8f9fb;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 16px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.22);
  font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  padding: 14px 14px 12px;
}
.fnd-kicker {
  margin: 0 64px 4px 0;
  color: #60646c;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.fnd-overlay h2 {
  font-size: 20px;
  margin: 0 64px 10px 0;
  letter-spacing: -0.03em;
  text-transform: uppercase;
}
.fnd-close,
.fnd-details {
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  background: #fff;
  color: #11181c;
  padding: 6px 9px;
  cursor: pointer;
  font: inherit;
}
.fnd-close {
  position: absolute;
  top: 12px;
  right: 12px;
}
.fnd-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  color: #60646c;
  font-size: 12px;
}
.verdict-card {
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  border-left: 4px solid #e2c547;
  background: #fff7c2;
  padding: 10px 12px;
}
.verdict-card.tone-real {
  background: #e6f6eb;
  border-color: #8eceaa;
  border-left-color: #18794e;
}
.verdict-card.tone-fake {
  background: #feebec;
  border-color: #f4a9aa;
  border-left-color: #c62a2f;
}
.verdict-card-header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.verdict-title {
  font-weight: 800;
  letter-spacing: -0.03em;
  text-transform: uppercase;
}
.tone-real .verdict-title { color: #18794e; }
.tone-fake .verdict-title { color: #c62a2f; }
.tone-uncertain .verdict-title { color: #ad5700; }
.verdict-confidence,
.muted,
.warning-line {
  font-size: 12px;
  color: #60646c;
}
.verdict-reason {
  margin: 0 0 8px;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 999px;
  background: #fff;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
}
.warning-line {
  color: #ad5700;
  margin: 8px 0 0;
}
`;
