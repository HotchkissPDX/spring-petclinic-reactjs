import * as React from 'react';
import { shallow } from 'enzyme';

import UserCreatePage from '../../../../src/components/admin/UserCreatePage';

const fetchMock: any = global.fetch;

describe('UserCreatePage', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    fetchMock.mockResponse('');
  });

  it('should render a username input', () => {
    const wrapper = shallow(<UserCreatePage />);
    const input = wrapper.find('input[name="username"]');
    expect(input.length).toBe(1);
    expect(input.props().type).toBe('text');
  });

  it('should render a password input', () => {
    const wrapper = shallow(<UserCreatePage />);
    const input = wrapper.find('input[name="password"]');
    expect(input.length).toBe(1);
    expect(input.props().type).toBe('password');
  });

  it('should render checkboxes for each role', () => {
    const wrapper = shallow(<UserCreatePage />);
    const checkboxes = wrapper.find('input[type="checkbox"]');
    expect(checkboxes.length).toBe(3);

    const labels = wrapper.find('label').filterWhere(l => l.find('input[type="checkbox"]').length > 0);
    const labelTexts = labels.map(l => l.text());
    expect(labelTexts).toContain('Owner Admin');
    expect(labelTexts).toContain('Vet Admin');
    expect(labelTexts).toContain('Admin');
  });

  it('should render a Create User submit button', () => {
    const wrapper = shallow(<UserCreatePage />);
    const button = wrapper.find('button[type="submit"]');
    expect(button.length).toBe(1);
    expect(button.text()).toContain('Create User');
  });

  it('should update username and password state on input change', () => {
    const wrapper = shallow(<UserCreatePage />);
    wrapper.find('input[name="username"]').simulate('change', { target: { name: 'username', value: 'newuser' } });
    wrapper.find('input[name="password"]').simulate('change', { target: { name: 'password', value: 'secret123' } });

    expect(wrapper.state('username')).toBe('newuser');
    expect(wrapper.state('password')).toBe('secret123');
  });

  it('should toggle role selection on checkbox change', () => {
    const wrapper = shallow(<UserCreatePage />);
    const ownerCheckbox = wrapper.find('input[value="ROLE_OWNER_ADMIN"]');
    ownerCheckbox.simulate('change', { target: { value: 'ROLE_OWNER_ADMIN', checked: true } });
    expect((wrapper.state('roles') as string[])).toContain('ROLE_OWNER_ADMIN');

    wrapper.find('input[value="ROLE_OWNER_ADMIN"]').simulate('change', { target: { value: 'ROLE_OWNER_ADMIN', checked: false } });
    expect((wrapper.state('roles') as string[])).not.toContain('ROLE_OWNER_ADMIN');
  });

  it('should display success message after successful creation', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ username: 'newuser' }), { status: 201 });
    const wrapper = shallow(<UserCreatePage />);

    wrapper.setState({ username: 'newuser', password: 'secret123', roles: ['ROLE_OWNER_ADMIN'] });
    await (wrapper.instance() as any).onSubmit({ preventDefault: jest.fn() });
    wrapper.update();

    expect(wrapper.find('.alert-success').length).toBe(1);
    expect(wrapper.find('.alert-success').text()).toContain('newuser');
  });

  it('should display error message on failed creation', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ message: 'Username already exists' }), { status: 400 });
    const wrapper = shallow(<UserCreatePage />);

    wrapper.setState({ username: 'admin', password: 'pass', roles: ['ROLE_ADMIN'] });
    await (wrapper.instance() as any).onSubmit({ preventDefault: jest.fn() });
    wrapper.update();

    expect(wrapper.find('.alert-danger').length).toBe(1);
  });

  it('should send correct payload to POST /api/users/', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ username: 'newuser' }), { status: 201 });
    const wrapper = shallow(<UserCreatePage />);

    wrapper.setState({ username: 'newuser', password: 'secret123', roles: ['ROLE_OWNER_ADMIN', 'ROLE_VET_ADMIN'] });
    await (wrapper.instance() as any).onSubmit({ preventDefault: jest.fn() });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOpts] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('http://localhost:9966/petclinic/api/users');
    expect(calledOpts.method).toBe('POST');
    expect(calledOpts.credentials).toBe('include');

    const body = JSON.parse(calledOpts.body);
    expect(body.username).toBe('newuser');
    expect(body.password).toBe('secret123');
    expect(body.enabled).toBe(true);
    expect(body.roles).toEqual([{ name: 'ROLE_OWNER_ADMIN' }, { name: 'ROLE_VET_ADMIN' }]);
  });

  it('should reset form after successful creation', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ username: 'newuser' }), { status: 201 });
    const wrapper = shallow(<UserCreatePage />);

    wrapper.setState({ username: 'newuser', password: 'secret123', roles: ['ROLE_ADMIN'] });
    await (wrapper.instance() as any).onSubmit({ preventDefault: jest.fn() });
    wrapper.update();

    expect(wrapper.state('username')).toBe('');
    expect(wrapper.state('password')).toBe('');
    expect(wrapper.state('roles')).toEqual([]);
  });
});
