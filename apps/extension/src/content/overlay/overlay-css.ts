export default `
.fnd-overlay {
  position: fixed;
  z-index: 2147483647;
  right: 18px;
  bottom: 18px;
  width: min(360px, calc(100vw - 36px));
  background: #f8fafc;
  color: #14213d;
  border: 1px solid #b8c2d4;
  border-radius: 8px;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.24);
  font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  padding: 14px;
}
.fnd-overlay h2 {
  font-size: 16px;
  margin: 0 72px 10px 0;
}
.fnd-overlay p {
  margin: 7px 0;
}
.fnd-close {
  position: absolute;
  top: 10px;
  right: 10px;
}
.fnd-close,
.fnd-details {
  border: 1px solid #52627a;
  border-radius: 6px;
  background: #fff;
  color: #14213d;
  padding: 6px 9px;
  cursor: pointer;
}
.fnd-details {
  margin-top: 8px;
}
.fnd-warning {
  color: #6b4e00;
}
`;

