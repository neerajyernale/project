import { Component } from '@angular/core';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
})
export class Login {
  email = 'admin@wms360.com';
  password = '';
  showPassword = false;
  rememberMe = true;
  isLoading = false;
  loginError = '';
  emailTouched = false;
  passwordTouched = false;

  emailValid(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email);
  }

  passwordValid(): boolean {
    return this.password.length >= 6;
  }

  onEmailInput(event: Event): void {
    this.email = (event.target as HTMLInputElement).value;
  }

  onPasswordInput(event: Event): void {
    this.password = (event.target as HTMLInputElement).value;
  }

  toggleShowPassword(): void {
    this.showPassword = !this.showPassword;
  }

  toggleRememberMe(): void {
    this.rememberMe = !this.rememberMe;
  }

  handleLogin(event: Event): void {
    event.preventDefault();
    this.emailTouched = true;
    this.passwordTouched = true;

    if (!this.emailValid() || !this.passwordValid()) {
      this.loginError = 'Please check your email and password and try again.';
      return;
    }

    this.loginError = '';
    this.isLoading = true;

    setTimeout(() => {
      this.isLoading = false;
      window.dispatchEvent(new CustomEvent('login-success'));
    }, 1200);
  }
}
