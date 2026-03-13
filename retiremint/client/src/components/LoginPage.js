import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './HeaderComp';
import '../Stylesheets/LoginPage.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

function LoginPage() {
    const navigate = useNavigate();
    const googleButtonRef = useRef(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Load the Google Identity Services SDK
        const loadGoogleScript = () => {
            console.log('Loading Google Sign-In script...');
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.onload = () => {
                console.log('Google Sign-In script loaded successfully');
                initializeGoogleSignIn();
            };
            script.onerror = (error) => {
                console.error('Error loading Google Sign-In script:', error);
                setError('Failed to load authentication service. Please try again later.');
            };
            script.async = true;
            script.id = 'google-client-script';
            document.querySelector('body').appendChild(script);
        };

        // Initialize Google Sign-In
        const initializeGoogleSignIn = () => {
            if (!GOOGLE_CLIENT_ID) {
                console.error('Missing VITE_GOOGLE_CLIENT_ID');
                setError('Google Sign-In is not configured. Please contact support.');
                return;
            }

            if (window.google) {
                console.log('Initializing Google Sign-In...');
                try {
                    window.google.accounts.id.initialize({
                        client_id: GOOGLE_CLIENT_ID,
                        callback: handleCredentialResponse,
                        auto_select: false,
                        cancel_on_tap_outside: true,
                    });
                    
                    // Display the Sign In With Google button
                    window.google.accounts.id.renderButton(
                        googleButtonRef.current,
                        { 
                            type: 'standard', 
                            shape: 'pill', 
                            theme: 'filled_blue',
                            text: 'signin_with',
                            size: 'large', 
                            logo_alignment: 'left'
                        }
                    );
                    console.log('Google Sign-In initialized successfully');
                } catch (error) {
                    console.error('Error initializing Google Sign-In:', error);
                    setError('Failed to initialize authentication. Please try again later.');
                }
            } else {
                console.error('Google API not available');
                setError('Google authentication service not available');
            }
        };

        // Check if the script is already loaded
        if (!document.getElementById('google-client-script')) {
            loadGoogleScript();
        } else {
            initializeGoogleSignIn();
        }

        // Cleanup
        return () => {
            const scriptElement = document.getElementById('google-client-script');
            if (scriptElement) {
                scriptElement.remove();
            }
        };
    }, []);

    // Handle Google Sign-In response
    const handleCredentialResponse = (response) => {
        console.log('Received credential response from Google');
        setLoading(true);
        setError(null);
        
        // Post to backend for verification
        fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                credential: response.credential
            }),
        })
        .then(response => {
            console.log('Login response status:', response.status);
            if (!response.ok) {
                throw new Error(`Login failed with status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Login successful, received data:', data);
            
            // Store user data
            localStorage.setItem('userId', data.userId);
            if (data.name) localStorage.setItem('userName', data.name);
            if (data.email) localStorage.setItem('userEmail', data.email);
            
            // Redirect to the appropriate page
            if (data.isFirstTime) {
                console.log('First time user, redirecting to profile setup');
                navigate('/profile-setup');
            } else {
                console.log('Returning user, redirecting to dashboard');
                navigate('/dashboard');
            }
        })
        .catch(error => {
            console.error('Login error:', error);
            setError('Login failed. Please check your network connection and try again.');
            setLoading(false);
        });
    };

    // Continue as guest handler
    const handleGuestLogin = () => {
        console.log('Continuing as guest');
        // Set guest user data
        localStorage.setItem('userId', 'guest');
        localStorage.setItem('userName', 'Guest User');
        localStorage.setItem('userEmail', 'guest@retiremint.com');
        
        // Redirect to new scenario page
        navigate('/new-scenario/new');
    };

    return (
        <div className="login-page">
            <Header />
            <div className="login-container">
                <h1>Welcome to RetireMint</h1>
                <p>Your financial planning solution for a secure retirement</p>
                
                {error && (
                    <div className="error-message">
                        {error}
                    </div>
                )}
                
                <div className="login-options">
                    <div className="google-signin-button" ref={googleButtonRef}></div>
                    
                    {loading ? (
                        <div className="loading-spinner">
                            <div className="spinner"></div>
                            <p>Logging you in...</p>
                        </div>
                    ) : (
                        <>
                            <div className="separator">
                                <span>OR</span>
                            </div>
                            
                            <button className="guest-button" onClick={handleGuestLogin}>
                                Continue as Guest
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default LoginPage;
