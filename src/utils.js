export default function apiFetch(endpoint, options = {}) {
    options.headers = {
            // "Content-Type": "application/json",
    //     "Authorization": "Bearer "+cookie.load('token'),
    //     "X-debug-token": cookie.load('debug-token'),
    };
    const API_BASE_URL = 'https://1xi2rd4lsl.execute-api.us-east-1.amazonaws.com/dev';
    return fetch(`${API_BASE_URL}/${endpoint}`,options);
}