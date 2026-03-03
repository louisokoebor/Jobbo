Supabase Auth supports Sign in with Google for the web, native applications (Android, macOS and iOS), and Chrome extensions.

You can use Sign in with Google in two ways:

By writing application code for the web, native applications or Chrome extensions
By using Google's pre-built solutions such as personalized sign-in buttons, One Tap or automatic sign-in
Prerequisites#
You need to do some setup to get started with Sign in with Google:

Prepare a Google Cloud project. Go to the Google Cloud Platform and create a new project if necessary.
Use the Google Auth Platform console to register and set up your application's:
Audience by configuring which Google users are allowed to sign in to your application.
Data Access (Scopes) define what your application can do with your user's Google data and APIs, such as access profile information or more.
Branding and Verification show a logo and name instead of the Supabase project ID in the consent screen, improving user retention. Brand verification may take a few business days.
Setup required scopes#
Supabase Auth needs a few scopes granting access to profile data of your end users, which you have to configure in the Data Access (Scopes) screen:

openid (add manually)
.../auth/userinfo.email (added by default)
.../auth/userinfo.profile (added by default)
If you add more scopes, especially those on the sensitive or restricted list your application might be subject to verification which may take a long time.

Setup consent screen branding#
It's strongly recommended you set up a custom domain and optionally verify your brand information with Google, as this makes phishing attempts easier to spot by your users.

Google's consent screen is shown to users when they sign in. Optionally configure one of the following to improve the appearance of the screen, increasing the perception of trust by your users:

Verify your application's brand (logo and name) by configuring it in the Branding section of the Google Auth Platform console. Brand verification is not automatic and may take a few business days.
Set up a custom domain for your project to present the user with a clear relationship to the website they clicked Sign in with Google on.
A good approach is to use auth.example.com or api.example.com, if your application is hosted on example.com.
If you don't set this up, users will see <project-id>.supabase.co which does not inspire trust and can make your application more susceptible to successful phishing attempts.
Project setup#
To support Sign In with Google, you need to configure the Google provider for your Supabase project.


Web

Expo React Native

Flutter (iOS and Android)

Flutter (web, macOS, Windows, Linux)

Swift

Android (Kotlin)

Chrome Extensions
Regardless of whether you use application code or Google's pre-built solutions to implement the sign in flow, you need to configure your project by obtaining a Client ID and Client Secret in the Clients section of the Google Auth Platform console:

Create a new OAuth client ID and choose Web application for the application type.
Under Authorized JavaScript origins add your application's URL. These should also be configured as the Site URL or redirect configuration in your project.
If your app is hosted on https://example.com/app add https://example.com.
Add http://localhost:<port> while developing locally. Remember to remove this when your application goes into production.
Under Authorized redirect URIs add your Supabase project's callback URL.
Access it from the Google provider page on the Dashboard.
For local development, use http://127.0.0.1:54321/auth/v1/callback.
Click Create and make sure you save the Client ID and Client Secret.
Add these values to the Google provider page on the Dashboard.
Local development#
To use the Google provider in local development:

Add a new environment variable:
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET="<client-secret>"
Configure the provider in supabase/config.toml:
[auth.external.google]
enabled = true
client_id = "<client-id>"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"
skip_nonce_check = false
If you have multiple client IDs, such as one for Web, iOS and Android, concatenate all of the client IDs with a comma but make sure the web's client ID is first in the list.

Using the management API#
Use the PATCH /v1/projects/{ref}/config/auth Management API endpoint to configure the project's Auth settings programmatically. For configuring the Google provider send these options:

{
  "external_google_enabled": true,
  "external_google_client_id": "your-google-client-id",
  "external_google_secret": "your-google-client-secret"
}
Signing users in#

Web

Expo React Native

Flutter (iOS and Android)

Flutter (web, macOS, Windows, Linux)

Android (Kotlin)

Chrome Extensions
Application code#
To use your own application code for the signin button, call the signInWithOAuth method (or the equivalent for your language).

Make sure you're using the right supabase client in the following code.

If you're not using Server-Side Rendering or cookie-based Auth, you can directly use the createClient from @supabase/supabase-js. If you're using Server-Side Rendering, see the Server-Side Auth guide for instructions on creating your Supabase client.

supabase.auth.signInWithOAuth({
  provider: 'google',
})
For an implicit flow, that's all you need to do. The user will be taken to Google's consent screen, and finally redirected to your app with an access and refresh token pair representing their session.

For a PKCE flow, for example in Server-Side Auth, you need an extra step to handle the code exchange. When calling signInWithOAuth, provide a redirectTo URL which points to a callback route. This redirect URL should be added to your redirect allow list.


Client

Server
In the browser, signInWithOAuth automatically redirects to the OAuth provider's authentication endpoint, which then redirects to your endpoint.

await supabase.auth.signInWithOAuth({
  provider,
  options: {
    redirectTo: `http://example.com/auth/callback`,
  },
})
At the callback endpoint, handle the code exchange to save the user session.


Next.js

SvelteKit

Astro

Remix

Express
Create a new file at app/auth/callback/route.ts and populate with the following:

app/auth/callback/route.ts
import { NextResponse } from 'next/server'
// The client you created from the Server-Side Auth instructions
import { createClient } from '@/utils/supabase/server'
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  let next = searchParams.get('next') ?? '/'
  if (!next.startsWith('/')) {
    // if "next" is not a relative URL, use the default
    next = '/'
  }
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }
  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
After a successful code exchange, the user's session will be saved to cookies.

Saving Google tokens#
The tokens saved by your application are the Supabase Auth tokens. Your app might additionally need the Google OAuth 2.0 tokens to access Google services on the user's behalf.

On initial login, you can extract the provider_token from the session and store it in a secure storage medium. The session is available in the returned data from signInWithOAuth (implicit flow) and exchangeCodeForSession (PKCE flow).

Google does not send out a refresh token by default, so you will need to pass parameters like these to signInWithOAuth() in order to extract the provider_refresh_token:

const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    queryParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  },
})
Google pre-built #
Most web apps and websites can utilize Google's personalized sign-in buttons, One Tap or automatic sign-in for the best user experience.

Load the Google client library in your app by including the third-party script:

<script src="https://accounts.google.com/gsi/client" async></script>
Use the HTML Code Generator to customize the look, feel, features and behavior of the Sign in with Google button.

Pick the Swap to JavaScript callback option, and input the name of your callback function. This function will receive a CredentialResponse when sign in completes.

To make your app compatible with Chrome's third-party-cookie phase-out, make sure to set data-use_fedcm_for_prompt to true.

Your final HTML code might look something like this:

<div
  id="g_id_onload"
  data-client_id="<client ID>"
  data-context="signin"
  data-ux_mode="popup"
  data-callback="handleSignInWithGoogle"
  data-nonce=""
  data-auto_select="true"
  data-itp_support="true"
  data-use_fedcm_for_prompt="true"
></div>
<div
  class="g_id_signin"
  data-type="standard"
  data-shape="pill"
  data-theme="outline"
  data-text="signin_with"
  data-size="large"
  data-logo_alignment="left"
></div>
Create a handleSignInWithGoogle function that takes the CredentialResponse and passes the included token to Supabase. The function needs to be available in the global scope for Google's code to find it.

async function handleSignInWithGoogle(response) {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: response.credential,
  })
}
(Optional) Configure a nonce. The use of a nonce is recommended for extra security, but optional. The nonce should be generated randomly each time, and it must be provided in both the data-nonce attribute of the HTML code and the options of the callback function.

async function handleSignInWithGoogle(response) {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: response.credential,
    nonce: '<NONCE>',
  })
}
Note that the nonce should be the same in both places, but because Supabase Auth expects the provider to hash it (SHA-256, hexadecimal representation), you need to provide a hashed version to Google and a non-hashed version to signInWithIdToken.

You can get both versions by using the in-built crypto library:

// Adapted from https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest#converting_a_digest_to_a_hex_string
const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
const encoder = new TextEncoder()
const encodedNonce = encoder.encode(nonce)
crypto.subtle.digest('SHA-256', encodedNonce).then((hashBuffer) => {
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashedNonce = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
})
// Use 'hashedNonce' when making the authentication request to Google
// Use 'nonce' when invoking the supabase.auth.signInWithIdToken() method
One-tap with Next.js#
If you're integrating Google One-Tap with your Next.js application, you can refer to the example below to get started:

'use client'
import Script from 'next/script'
import { createClient } from '@/utils/supabase/client'
import type { accounts, CredentialResponse } from 'google-one-tap'
import { useRouter } from 'next/navigation'
declare const google: { accounts: accounts }
// generate nonce to use for google id token sign-in
const generateNonce = async (): Promise<string[]> => {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  const encoder = new TextEncoder()
  const encodedNonce = encoder.encode(nonce)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encodedNonce)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashedNonce = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return [nonce, hashedNonce]
}
const OneTapComponent = () => {
  const supabase = createClient()
  const router = useRouter()
  const initializeGoogleOneTap = async () => {
    console.log('Initializing Google One Tap')
    const [nonce, hashedNonce] = await generateNonce()
    console.log('Nonce: ', nonce, hashedNonce)
    // check if there's already an existing session before initializing the one-tap UI
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.error('Error getting session', error)
    }
    if (data.session) {
      router.push('/')
      return
    }
    /* global google */
    google.accounts.id.initialize({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      callback: async (response: CredentialResponse) => {
        try {
          // send id token returned in response.credential to supabase
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: response.credential,
            nonce,
          })
          if (error) throw error
          console.log('Session data: ', data)
          console.log('Successfully logged in with Google One Tap')
          // redirect to protected page
          router.push('/')
        } catch (error) {
          console.error('Error logging in with Google One Tap', error)
        }
      },
      nonce: hashedNonce,
      // with chrome's removal of third-party cookies, we need to use FedCM instead (https://developers.google.com/identity/gsi/web/guides/fedcm-migration)
      use_fedcm_for_prompt: true,
    })
    google.accounts.id.prompt() // Display the One Tap UI
  }
  return <Script onReady={initializeGoogleOneTap} src="https://accounts.google.com/gsi/client" />
}
export default OneTapComponent