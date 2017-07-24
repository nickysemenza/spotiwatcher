import React from 'react';
const SpotifyWidget = ({uri, compact=true}) => <iframe src={`https://open.spotify.com/embed?uri=${uri}`} width={300} height={compact ? 80 : 380} frameBorder={0} allowTransparency="true" title="SpotifyWidget"/>;
export default SpotifyWidget;
