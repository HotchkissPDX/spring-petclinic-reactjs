import * as React from 'react';
import { shallow } from 'enzyme';

import LoginPage from '../../../../src/components/auth/LoginPage';

describe('LoginPage', () => {
  it('should render a username input', () => {
    const wrapper = shallow(<LoginPage />);
    const usernameInput = wrapper.find('input[name="username"]');
    expect(usernameInput.length).toBe(1);
  });

  it('should render a password input', () => {
    const wrapper = shallow(<LoginPage />);
    const passwordInput = wrapper.find('input[name="password"]');
    expect(passwordInput.length).toBe(1);
    expect(passwordInput.props().type).toBe('password');
  });

  it('should render a submit button', () => {
    const wrapper = shallow(<LoginPage />);
    const button = wrapper.find('button[type="submit"]');
    expect(button.length).toBe(1);
    expect(button.text()).toContain('Sign In');
  });

  it('should update state on input change', () => {
    const wrapper = shallow(<LoginPage />);
    wrapper.find('input[name="username"]').simulate('change', { target: { name: 'username', value: 'admin' } });
    wrapper.find('input[name="password"]').simulate('change', { target: { name: 'password', value: 'secret' } });

    expect(wrapper.state('username')).toBe('admin');
    expect(wrapper.state('password')).toBe('secret');
  });

  it('should display error message when present in state', () => {
    const wrapper = shallow(<LoginPage />);
    wrapper.setState({ error: 'Invalid credentials' });
    expect(wrapper.find('.alert-danger').text()).toContain('Invalid credentials');
  });
});
