import * as React from 'react';
import { getCurrentUser, logout, isAuthenticated, hasRole } from '../auth';

const MenuItem = ({active, url, title, children}: { active: boolean, url: string, title: string, children?: any }) => (
  <li className={active ? 'active' : ''}>
    <a href={url} title={title}>{children}</a>
  </li>
);

const handleLogout = (e) => {
  e.preventDefault();
  logout().then(() => {
    window.location.href = '/login';
  });
};

export default ({name}: { name: string }) => {
  const user = getCurrentUser();

  return (
    <nav className='navbar navbar-default' role='navigation'>
      <div className='container'>
        <div className='navbar-header'>
          <a className='navbar-brand' href='/'><span></span></a>
          <button type='button' className='navbar-toggle' data-toggle='collapse' data-target='#main-navbar'>
            <span className='icon-bar'></span>
            <span className='icon-bar'></span>
            <span className='icon-bar'></span>
          </button>
        </div>
        <div className='navbar-collapse collapse' id='main-navbar'>
          <ul className='nav navbar-nav navbar-right'>
            <MenuItem active={name === '/'} url='/' title='home page'>
              <span className='glyphicon glyphicon-home' aria-hidden='true'></span>&nbsp;
                      <span>Home</span>
            </MenuItem>

            <MenuItem active={name.startsWith('/owners')} url='/owners/list' title='find owners'>
              <span className='glyphicon glyphicon-search' aria-hidden='true'></span>&nbsp;
                      <span>Find owners</span>
            </MenuItem>

            <MenuItem active={name === 'vets'} url='/vets' title='veterinarians'>
              <span className='glyphicon glyphicon-th-list' aria-hidden='true'></span>&nbsp;
                      <span>Veterinarians</span>
            </MenuItem>

            <MenuItem active={name === 'error'} url='/error'
              title='trigger a RuntimeException to see how it is handled'>
              <span className='glyphicon glyphicon-warning-sign' aria-hidden='true'></span>&nbsp;
                      <span>Error</span>
            </MenuItem>

            {user && hasRole('ROLE_ADMIN') && (
              <MenuItem active={name === '/admin/users/new'} url='/admin/users/new' title='manage users'>
                <span className='glyphicon glyphicon-user' aria-hidden='true'></span>&nbsp;
                <span>Manage Users</span>
              </MenuItem>
            )}

            {user && (
              <li>
                <a href='#' onClick={handleLogout} title='logout'>
                  <span className='glyphicon glyphicon-log-out' aria-hidden='true'></span>&nbsp;
                  <span>{user.username} (Logout)</span>
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
};
