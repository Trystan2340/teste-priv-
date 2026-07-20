// Simple debug script to test if JS is working
console.log('Debug script loaded');

// Add a simple event listener to the new game button
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');

    const btnNew = document.getElementById('btn-new');
    if (btnNew) {
        console.log('Found new game button');
        btnNew.addEventListener('click', function() {
            console.log('New game button clicked!');
            alert('New game button works!');
        });
    } else {
        console.log('New game button NOT found');
    }
});