import React, { Component } from 'react';
import apiFetch from '../utils';
import {Link} from "react-router-dom";
import SpotifyWidget from "../components/SpotifyWidget";

class Playlist extends Component {
    constructor (props) {
        super(props);
        this.state = { feed: [], uriInput: ""};
        this.handleChange = this.handleChange.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
    }
    componentDidMount() {
        this.fetchData(this.getUserId());
    }
    handleChange(event) {
        this.setState({uriInput: event.target.value});
    }
    handleSubmit(event) {
        event.preventDefault();
        let user = this.getUserId();
        apiFetch(`addPlaylist?uri=${this.state.uriInput}&requesterUserId=${user}`)
            .then((response) => response.json()).then((json) => console.log(json));
    }

    fetchData(user) {
        let x;
        if(user) {
            x = apiFetch('feed?requesterUserId='+user);
        } else {
            x = apiFetch('feed');
        }
        x.then((response) => response.json()).then((json) => this.setState({feed: json}));

    }
    getUserId() {
        return this.props.match.params.userId ? this.props.match.params.userId : null
    }

    render () {
        let userId = this.getUserId();
        let diffList = this.state.feed.map(feedItem=>
            <li key={feedItem.added_at}>
                added at {feedItem.added_at} to <Link to={`/playlist/${feedItem.uri}`}>{feedItem.playlistName} [{feedItem.uri}]</Link>
                <br/>
                <SpotifyWidget uri={feedItem.uri} />
            </li>
        );
        return(<div>
            <h1>Viewing Feed for {userId}</h1>
            <h2>Diffs</h2>
            <ul>{diffList}</ul>
            {userId !== null ?
                <form onSubmit={this.handleSubmit}>
                    <label>
                        URI (e.g. spotify:user:14nicholasse:playlist:4Bni1YMfRtdwQ2jKIvv2lR):
                        <input type="text" value={this.state.uriInput} onChange={this.handleChange} />
                    </label>
                    <input type="submit" value="Submit" />
                </form> : null}
        </div>)
    }
}
export default Playlist;
