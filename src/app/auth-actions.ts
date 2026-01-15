'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function logoutAction() {
  const cookieStore = await cookies()
  // Clear the auth_token cookie
  cookieStore.set('auth_token', '', { 
    path: '/', 
    domain: '.atap.solar', 
    expires: new Date(0) 
  })
  
  // Redirect to the auth hub logout to clear the session there as well
  redirect('https://auth.atap.solar/auth/logout')
}
