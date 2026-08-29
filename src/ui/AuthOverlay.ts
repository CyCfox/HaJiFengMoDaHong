import { el } from "./helpers";

export type AuthMode = "login" | "register";

export class AuthOverlay {
  readonly root: HTMLElement;
  private mode: AuthMode = "login";
  private usernameInput!: HTMLInputElement;
  private passwordInput!: HTMLInputElement;
  private confirmInput!: HTMLInputElement;
  private confirmRow!: HTMLElement;
  private error!: HTMLElement;
  private submitButton!: HTMLButtonElement;

  constructor(
    private onSubmit: (mode: AuthMode, username: string, password: string) => Promise<void>,
    private onClose: () => void,
  ) {
    this.root = el("div", "auth-screen hidden");
    this.root.innerHTML = `
      <div class="auth-card">
        <h2>账号登录</h2>
        <div class="auth-tabs">
          <button class="auth-tab auth-login-tab active">登录</button>
          <button class="auth-tab auth-register-tab">注册</button>
        </div>
        <label class="auth-field"><span>用户名</span><input class="auth-username" maxlength="24" autocomplete="username" /></label>
        <label class="auth-field"><span>密码</span><input class="auth-password" type="password" maxlength="128" autocomplete="current-password" /></label>
        <label class="auth-field auth-confirm-row"><span>确认密码</span><input class="auth-confirm" type="password" maxlength="128" autocomplete="new-password" /></label>
        <div class="auth-error"></div>
        <button class="primary-button auth-submit">登录</button>
        <button class="ghost-button auth-close">关闭</button>
      </div>
    `;
    this.usernameInput = this.root.querySelector<HTMLInputElement>(".auth-username")!;
    this.passwordInput = this.root.querySelector<HTMLInputElement>(".auth-password")!;
    this.confirmInput = this.root.querySelector<HTMLInputElement>(".auth-confirm")!;
    this.confirmRow = this.root.querySelector<HTMLElement>(".auth-confirm-row")!;
    this.error = this.root.querySelector<HTMLElement>(".auth-error")!;
    this.submitButton = this.root.querySelector<HTMLButtonElement>(".auth-submit")!;

    this.root.querySelector<HTMLButtonElement>(".auth-login-tab")!.addEventListener("click", () => this.switchMode("login"));
    this.root.querySelector<HTMLButtonElement>(".auth-register-tab")!.addEventListener("click", () => this.switchMode("register"));
    this.root.querySelector<HTMLButtonElement>(".auth-close")!.addEventListener("click", () => {
      this.setBusy(false);
      this.onClose();
    });
    this.submitButton.addEventListener("click", () => void this.submit());
    this.passwordInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void this.submit();
    });
  }

  show(required = false): void {
    this.root.classList.remove("hidden");
    this.root.classList.toggle("auth-required", required);
    this.root.querySelector<HTMLButtonElement>(".auth-close")!.classList.toggle("hidden", required);
    this.switchMode("login");
    this.error.textContent = "";
    this.usernameInput.focus();
  }

  hide(): void {
    this.root.classList.add("hidden");
    this.setBusy(false);
  }

  setError(message: string): void {
    this.error.textContent = message;
  }

  private switchMode(mode: AuthMode): void {
    this.mode = mode;
    this.confirmRow.classList.toggle("hidden", mode === "login");
    this.root.querySelector<HTMLButtonElement>(".auth-login-tab")!.classList.toggle("active", mode === "login");
    this.root.querySelector<HTMLButtonElement>(".auth-register-tab")!.classList.toggle("active", mode === "register");
    this.root.querySelector("h2")!.textContent = mode === "login" ? "账号登录" : "注册账号";
    this.submitButton.textContent = mode === "login" ? "登录" : "注册并登录";
    this.error.textContent = "";
  }

  private setBusy(busy: boolean): void {
    this.submitButton.disabled = busy;
    this.submitButton.textContent = busy ? "处理中..." : (this.mode === "login" ? "登录" : "注册并登录");
  }

  private async submit(): Promise<void> {
    const username = this.usernameInput.value.trim();
    const password = this.passwordInput.value;
    const confirm = this.confirmInput.value;
    if (!username || !password) {
      this.setError("请输入用户名和密码");
      return;
    }
    if (this.mode === "register" && password !== confirm) {
      this.setError("两次输入的密码不一致");
      return;
    }
    this.setBusy(true);
    this.setError("");
    try {
      await this.onSubmit(this.mode, username, password);
      this.hide();
    } catch (error) {
      this.setBusy(false);
      this.setError(error instanceof Error ? error.message : "操作失败，请重试");
    }
  }
}
