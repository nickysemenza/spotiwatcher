import React, { Component } from 'react';
import apiFetch from '../utils';
import {Link} from "react-router-dom";

class PlaylistsToWatch extends Component {
    constructor (props) {
        super(props);
        this.state = { list: [] };
    }
    componentDidMount() {
         this.fetchData();
    }

    fetchData() {
        apiFetch('playlists/watching')
            .then((response) => response.json())
            .then((json) => this.setState({list: json}));
    }

    render () {
        let a = this.state.list.map(i=>{
            return(<li key={i.uri}><Link to={`/playlist/${i.uri}`}>{i.uri}</Link></li>);
        });
        return(<div>
            Tracking playlists:
            <ul>{a}</ul>
        </div>)
    }
}
export default PlaylistsToWatch;
