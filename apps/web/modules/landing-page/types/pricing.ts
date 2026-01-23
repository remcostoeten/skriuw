export type TBilling = 'yearly' | 'monthly'

export type TPlan = {
  id: string
  title: string
  badge?: string
  yearly: number | null
  monthly: number | null
  unit: string
  items: string[]
  cta: string
  tone: 'base' | 'hot'
}

export const plans: TPlan[] = [
  {
    id: 'starter',
    title: 'Starter',
    yearly: 0,
    monthly: 0,
    unit: 'per month',
    items: [
      'Up to 3 projects',
      '50 tasks per month',
      'Mobile & desktop access',
      'Basic checklists'
    ],
    cta: 'Get started',
    tone: 'base'
  },
  {
    id: 'basic',
    title: 'Basic',
    yearly: 0,
    monthly: 0,
    unit: 'per month',
    items: [
      'Unlimited projects',
      'Unlimited tasks',
      'Task due dates & reminders',
      'Share with up to 3 collaborators'
    ],
    cta: 'Get started',
    tone: 'base'
  },
  {
    id: 'premium',
    title: 'Basic',
    badge: 'Recommended',
    yearly: 0,
    monthly: 0,
    unit: 'per month',
    items: [
      'Everything in Basic, plus:',
      'Unlimited personal tasks',
      'Basic projects & checklists',
      'Mobile & desktop access',
      'Share with up to 2 collaborators'
    ],
    cta: 'Get started',
    tone: 'hot'
  },
  {
    id: 'supporter',
    title: 'Supporter',
    yearly: null,
    monthly: null,
    unit: '',
    items: [
      'Everything in Premium, plus:',
      'Custom workflows & automations',
      'Advanced reporting & insights',
      'Role-based permissions',
      'Integrations (Slack, Google, Notion, etc.)'
    ],
    cta: 'Get started',
    tone: 'base'
  }
]
