import * as React from 'react';
import { Route, IndexRoute, Redirect } from 'react-router';

import App from './components/App';

import WelcomePage from './components/WelcomePage';
import FindOwnersPage from './components/owners/FindOwnersPage';
import OwnersPage from './components/owners/OwnersPage';
import NewOwnerPage from './components/owners/NewOwnerPage';
import EditOwnerPage from './components/owners/EditOwnerPage';
import NewPetPage from './components/pets/NewPetPage';
import EditPetPage from './components/pets/EditPetPage';
import VisitsPage from './components/visits/VisitsPage';
import VetsPage from './components/vets/VetsPage';
import ErrorPage from './components/ErrorPage';
import LoginPage from './components/auth/LoginPage';
import UserCreatePage from './components/admin/UserCreatePage';

import NotFoundPage from './components/NotFoundPage';

import { checkSession, hasRole } from './auth';

const requireAdmin = (nextState, replace, callback) => {
  checkSession().then(user => {
    if (!user) {
      replace({ pathname: '/login', state: { nextPathname: nextState.location.pathname } });
    } else if (!hasRole('ROLE_ADMIN')) {
      replace({ pathname: '/' });
    }
    callback();
  }).catch(() => {
    replace({ pathname: '/login', state: { nextPathname: nextState.location.pathname } });
    callback();
  });
};

const requireAuth = (nextState, replace, callback) => {
  checkSession().then(user => {
    if (!user) {
      replace({ pathname: '/login', state: { nextPathname: nextState.location.pathname } });
    }
    callback();
  }).catch(() => {
    replace({ pathname: '/login', state: { nextPathname: nextState.location.pathname } });
    callback();
  });
};

export default () => (
  <Route component={App}>
    <Route path='/login' component={LoginPage} />
    <Route path='/' component={WelcomePage} onEnter={requireAuth} />
    <Route path='/owners/list' component={FindOwnersPage} onEnter={requireAuth} />
    <Route path='/owners/new' component={NewOwnerPage} onEnter={requireAuth} />
    <Route path='/owners/:ownerId/edit' component={EditOwnerPage} onEnter={requireAuth} />
    <Route path='/owners/:ownerId/pets/:petId/edit' component={EditPetPage} onEnter={requireAuth} />
    <Route path='/owners/:ownerId/pets/new' component={NewPetPage} onEnter={requireAuth} />
    <Route path='/owners/:ownerId/pets/:petId/visits/new' component={VisitsPage} onEnter={requireAuth} />
    <Route path='/owners/:ownerId' component={OwnersPage} onEnter={requireAuth} />
    <Route path='/vets' component={VetsPage} onEnter={requireAuth} />
    <Route path='/error' component={ErrorPage} onEnter={requireAuth} />
    <Route path='/admin/users/new' component={UserCreatePage} onEnter={requireAdmin} />
    <Route path='*' component={NotFoundPage} />
  </Route>
);
