import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import Routes from './Routes';

const App = () => (
    <BrowserRouter>
        <div>
            <Routes/>
        </div>
    </BrowserRouter>
);
export default App;
