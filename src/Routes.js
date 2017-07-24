import React from "react";
import { Route } from 'react-router-dom'

import { Container } from 'semantic-ui-react';

//STATIC PAGES
import Home from './pages/Home';
import Playlist from './pages/Playlist';
import Feed from './pages/Feed';

//

const Routes = () => (
    <Container>
        <Route exact path="/" component={Home}/>
        <Route path="/playlist/:playlistId" component={Playlist}/>
        <Route path="/feed/:userId?" component={Feed}/>
    </Container>
);

export default Routes;
