import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface UserProfile {
  id: string
  email: string
  role: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserProfile | null>(null)
  const accessToken = ref<string | null>(localStorage.getItem('accessToken'))

  const isAuthenticated = computed(() => !!accessToken.value)

  function setAuth(newUser: UserProfile, token: string) {
    user.value = newUser
    accessToken.value = token
    localStorage.setItem('accessToken', token)
  }

  function clearAuth() {
    user.value = null
    accessToken.value = null
    localStorage.removeItem('accessToken')
  }

  return {
    user,
    accessToken,
    isAuthenticated,
    setAuth,
    clearAuth,
  }
})
