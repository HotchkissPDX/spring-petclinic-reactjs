import * as React from 'react';
import OwnerEditor from './OwnerEditor';

import { IOwner } from '../../types';
import { url } from '../../util';

interface IEditOwnerPageProps {
  params?: { ownerId?: string };
}

interface IEditOwnerPageState {
  owner: IOwner;
}

export default class EditOwnerPage extends React.Component<IEditOwnerPageProps, IEditOwnerPageState> {
  componentDidMount() {
    const { params } = this.props;

    if (params && params.ownerId) {
      const fetchUrl = url(`api/owners/${params.ownerId}`);
      fetch(fetchUrl, { credentials: 'include' })
        .then(response => response.ok ? response.json() : null)
        .then(owner => { if (owner) this.setState({ owner }); });
    }
  }
  render() {
    const owner = this.state && this.state.owner;
    if (owner) {
      return <OwnerEditor initialOwner={owner} />;
    }
    return null;
  }
}
