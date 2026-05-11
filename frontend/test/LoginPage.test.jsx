import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../src/App.jsx';

describe('LoginPage', () => {
  it('submits username and password', () => {
    const onLogin = vi.fn();

    render(<LoginPage onLogin={onLogin} loading={false} error="" />);

    fireEvent.change(screen.getByLabelText('Tên đăng nhập'), {
      target: { value: 'dispatcher' }
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), {
      target: { value: 'password123' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(onLogin).toHaveBeenCalledWith({
      username: 'dispatcher',
      password: 'password123'
    });
  });

  it('shows error and disables submit while loading', () => {
    render(<LoginPage onLogin={vi.fn()} loading error="Sai thông tin đăng nhập" />);

    expect(screen.getByText('Sai thông tin đăng nhập')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đang xử lý...' })).toBeDisabled();
  });
});
