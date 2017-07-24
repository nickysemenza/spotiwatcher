import React from 'react';
import PlaylistsToWatch from '../components/PlaylistsToWatch';
import { Grid } from 'semantic-ui-react';
const Home = () => (
    <Grid centered columns={3}>
        <Grid.Column>
            <h1>Spotify Watcher</h1>
            <PlaylistsToWatch />
        </Grid.Column>
    </Grid>

);
export default Home;
