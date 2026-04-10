import * as React from 'react';
import { IRouterContext } from '../../types';
import { login } from '../../auth';

interface ILoginPageState {
  username: string;
  password: string;
  error: string | null;
}

export default class LoginPage extends React.Component<any, ILoginPageState> {

  context: IRouterContext;

  static contextTypes = {
    router: React.PropTypes.object
  };

  constructor(props) {
    super(props);
    this.state = { username: '', password: '', error: null };
    this.onInputChange = this.onInputChange.bind(this);
    this.onSubmit = this.onSubmit.bind(this);
  }

  onInputChange(e) {
    this.setState({ [e.target.name]: e.target.value } as any);
  }

  async onSubmit(e) {
    e.preventDefault();
    this.setState({ error: null });

    const user = await login(this.state.username, this.state.password);
    if (user) {
      const nextPath = this.props.location && this.props.location.state && this.props.location.state.nextPathname;
      this.context.router.push(nextPath || '/');
    } else {
      this.setState({ error: 'Invalid username or password' });
    }
  }

  render() {
    const { username, password, error } = this.state;

    return (
      <div>
        <h2>Sign In</h2>
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
            <div className='col-sm-offset-2 col-sm-10'>
              <button type='submit' className='btn btn-default'>Sign In</button>
            </div>
          </div>
        </form>
      </div>
    );
  }
}
