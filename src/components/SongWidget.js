import React from 'react';
const SongWidget = ({uri}) => <iframe src={`https://open.spotify.com/embed?uri=${uri}`} width={300} height={80} frameBorder={0} allowTransparency="true" title="songwidget"/>;
export default SongWidget;
