// Initialize socket with fallback transports for production environments like Render
const socket = io({
    transports: ['websocket', 'polling']
});

socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err);
});

socket.on('connect', () => {
    console.log('Successfully connected to server');
});