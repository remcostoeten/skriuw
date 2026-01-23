export type TItem = {
  id: string
  q: string
  a: string
}

export const items: TItem[] = [
  {
    id: 'free-version',
    q: 'Is there a free version?',
    a: 'Yes. Skriuw works great without an account, you can write, organize, and export locally. Paid plans are for optional cloud sync and team features.'
  },
  {
    id: 'change-plan',
    q: 'Can I change my plan later?',
    a: 'Anytime. You can upgrade, downgrade, or cancel without losing access to your local documents.'
  },
  {
    id: 'mobile-app',
    q: 'Do you offer a mobile app?',
    a: 'Not yet. Skriuw is focused on a fast desktop and web experience first. Mobile is planned once the editor and offline storage are fully polished.'
  },
  {
    id: 'yearly-discount',
    q: 'Do you offer discounts for yearly billing?',
    a: 'Yes. Yearly billing is priced lower than paying monthly, and you can switch whenever you like.'
  },
  {
    id: 'payment-methods',
    q: 'What payment methods do you accept?',
    a: 'Cards and local payment methods depending on your region. If you need invoices for a business, Skriuw supports that on paid plans.'
  }
]
