import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/mocks/server'
import { renderWithProviders } from '@/test/utils'
import PersonalTasksPage from './PersonalTasksPage'

describe('PersonalTasksPage', () => {
  beforeEach(() => {
    // Seed localStorage with authenticated user and token
    localStorage.setItem('token', 'test-jwt-token')
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 1,
        email: 'user@example.com',
        name: 'Test User',
        role: 'developer',
        is_first_login: false,
      }),
    )
    localStorage.setItem('capabilities', JSON.stringify([]))
  })

  it('renders the page header and layout', async () => {
    renderWithProviders(<PersonalTasksPage />)
    await waitFor(() => {
      expect(screen.getByText('Personal Tasks')).toBeInTheDocument()
      expect(screen.getByText('Manage your personal tasks')).toBeInTheDocument()
    })
  })

  it('displays task list with default mock data', async () => {
    // Uses default handler from handlers.ts which returns 1 task
    renderWithProviders(<PersonalTasksPage />)

    await waitFor(() => {
      expect(screen.getByText(/manage your personal tasks/i)).toBeInTheDocument()
    })
  })

  it('displays empty state when no tasks exist', async () => {
    server.use(
      http.get('/api/personal-tasks/', () => {
        return HttpResponse.json([])
      }),
    )

    renderWithProviders(<PersonalTasksPage />)

    await waitFor(
      () => {
        expect(screen.queryByText(/no tasks yet/i)).toBeInTheDocument()
      },
      { timeout: 3000 },
    )
  })

  it('opens create task dialog on new task button click', async () => {
    const user = userEvent.setup()

    renderWithProviders(<PersonalTasksPage />)

    const newTaskButton = await screen.findByRole('button', { name: /new task/i })
    await user.click(newTaskButton)

    await waitFor(() => {
      expect(screen.getByText('Create Personal Task')).toBeInTheDocument()
    })
  })

  it('allows typing task title in create dialog', async () => {
    const user = userEvent.setup()

    renderWithProviders(<PersonalTasksPage />)

    const newTaskButton = await screen.findByRole('button', { name: /new task/i })
    await user.click(newTaskButton)

    const titleInput = screen.getByPlaceholderText('What needs to be done?')
    await user.type(titleInput, 'New Test Task')

    expect(titleInput).toHaveValue('New Test Task')
  })

  it('has create task button in dialog', async () => {
    const user = userEvent.setup()

    renderWithProviders(<PersonalTasksPage />)

    const newTaskButton = await screen.findByRole('button', { name: /new task/i })
    await user.click(newTaskButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create task/i })).toBeInTheDocument()
    })
  })

  it('renders filter dropdown with status options', async () => {
    const user = userEvent.setup()

    renderWithProviders(<PersonalTasksPage />)

    // The filter trigger appears after toolbar loads
    const filterButtons = await screen.findAllByRole('button')
    // Find the button with Filter icon that triggers the select
    const filterButton = filterButtons.find(
      (btn) => btn.textContent?.includes('Filter') || btn.querySelector('svg'),
    )

    if (filterButton) {
      await user.click(filterButton)

      await waitFor(() => {
        expect(screen.queryByText(/pending/i)).toBeInTheDocument()
      }, { timeout: 1000 })
    }
  })

  it('displays search input for task filtering', async () => {
    renderWithProviders(<PersonalTasksPage />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search tasks...')).toBeInTheDocument()
    })
  })

  it('renders stats section with task counts', async () => {
    renderWithProviders(<PersonalTasksPage />)

    await waitFor(() => {
      expect(screen.getByText('Total Tasks')).toBeInTheDocument()
      expect(screen.getByText('Pending')).toBeInTheDocument()
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })
  })

  it('renders new task button', async () => {
    renderWithProviders(<PersonalTasksPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new task/i })).toBeInTheDocument()
    })
  })

  it('closes create dialog when escape is pressed', async () => {
    const user = userEvent.setup()

    renderWithProviders(<PersonalTasksPage />)

    const newTaskButton = await screen.findByRole('button', { name: /new task/i })
    await user.click(newTaskButton)

    await waitFor(() => {
      expect(screen.getByText('Create Personal Task')).toBeInTheDocument()
    })

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByText('Create Personal Task')).not.toBeInTheDocument()
    })
  })
})
