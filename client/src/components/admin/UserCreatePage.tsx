import * as React from 'react';
import { IRouterContext } from '../../types';
import { submitForm } from '../../util';

const AVAILABLE_ROLES = [
  { value: 'ROLE_OWNER_ADMIN', label: 'Owner Admin' },
  { value: 'ROLE_VET_ADMIN', label: 'Vet Admin' },
  { value: 'ROLE_ADMIN', label: 'Admin' }
];

interface IUserCreatePageState {
  username: string;
  password: string;
  roles: string[];
  success: string | null;
  error: string | null;
}

export default class UserCreatePage extends React.Component<any, IUserCreatePageState> {

  context: IRouterContext;

  static contextTypes = {
    router: React.PropTypes.object
  };

  constructor(props) {
    super(props);
    this.state = { username: '', password: '', roles: [], success: null, error: null };
    this.onInputChange = this.onInputChange.bind(this);
    this.onRoleChange = this.onRoleChange.bind(this);
    this.onSubmit = this.onSubmit.bind(this);
  }

  onInputChange(e) {
    this.setState({ [e.target.name]: e.target.value } as any);
  }

  onRoleChange(e) {
    const { value, checked } = e.target;
    const { roles } = this.state;
    if (checked) {
      this.setState({ roles: [...roles, value] });
    } else {
      this.setState({ roles: roles.filter(r => r !== value) });
    }
  }

  async onSubmit(e) {
    e.preventDefault();
    this.setState({ success: null, error: null });

    const { username, password, roles } = this.state;

    const payload = {
      username,
      password,
      enabled: true,
      roles: roles.map(r => ({ name: r }))
    };

    return submitForm('POST', 'api/users', payload, (status, response) => {
      if (status === 200 || status === 201) {
        this.setState({
          success: `User "${response.username || username}" created successfully.`,
          username: '',
          password: '',
          roles: []
        });
      } else {
        const message = response.message || response.exMessage || 'Failed to create user.';
        this.setState({ error: message });
      }
    });
  }

  render() {
    const { username, password, roles, success, error } = this.state;

    return (
      <div>
        <h2>Create User</h2>
        {success && <div className='alert alert-success'>{success}</div>}
        {error && <div className='alert alert-danger'>{error}</div>}
        <form className='form-horizontal' onSubmit={this.onSubmit}>
          <div className='form-group'>
            <label className='col-sm-2 control-label'>Username</label>
            <div className='col-sm-10'>
              <input
                type='text'
                name='username'
                className='form-control'
                value={username}
                onChange={this.onInputChange}
              />
            </div>
          </div>
          <div className='form-group'>
            <label className='col-sm-2 control-label'>Password</label>
            <div className='col-sm-10'>
              <input
                type='password'
                name='password'
                className='form-control'
                value={password}
                onChange={this.onInputChange}
              />
            </div>
          </div>
          <div className='form-group'>
            <label className='col-sm-2 control-label'>Roles</label>
            <div className='col-sm-10'>
              {AVAILABLE_ROLES.map(role => (
                <label key={role.value} className='checkbox-inline'>
                  <input
                    type='checkbox'
                    value={role.value}
                    checked={roles.indexOf(role.value) !== -1}
                    onChange={this.onRoleChange}
                  />
                  {role.label}
                </label>
              ))}
            </div>
          </div>
          <div className='form-group'>
            <div className='col-sm-offset-2 col-sm-10'>
              <button type='submit' className='btn btn-default'>Create User</button>
            </div>
          </div>
        </form>
      </div>
    );
  }
}
