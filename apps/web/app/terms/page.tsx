import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service - skriuw',
  description: 'Terms of service for skriuw application',
}

export default function TermsOfService() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <h1>Terms of Service</h1>
        <p className="text-muted-foreground">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <h2>Acceptance of Terms</h2>
        <p>
          By accessing and using skriuw, you accept and agree to be bound by the terms 
          and provision of this agreement.
        </p>

        <h2>Use License</h2>
        <p>
          Permission is granted to temporarily use skriuw for personal, non-commercial 
          transitory viewing only. This is the grant of a license, not a transfer of title.
        </p>

        <h2>User Accounts</h2>
        <p>
          You are responsible for safeguarding the password that you use to access the service 
          and for any activities or actions under your password.
        </p>

        <h2>User Conduct</h2>
        <p>
          You agree not to use the service to:
        </p>
        <ul>
          <li>Violate any applicable laws or regulations</li>
          <li>Infringe upon or violate our intellectual property rights or the intellectual 
              property rights of others</li>
          <li>Harass, abuse, insult, harm, defame, or discriminate</li>
          <li>Submit false or misleading information</li>
          <li>Upload viruses or other malicious code</li>
          <li>Spam, phish, pharm, pretext, spider, crawl, or scrape</li>
        </ul>

        <h2>Intellectual Property</h2>
        <p>
          The service and its original content, features and functionality are and will 
          remain the exclusive property of skriuw and its licensors.
        </p>

        <h2>Privacy</h2>
        <p>
          Your privacy is important to us. Please review our Privacy Policy, which also 
          governs the Service, to understand our practices.
        </p>

        <h2>Termination</h2>
        <p>
          We may terminate or suspend your account and bar access to the service immediately, 
          without prior notice or liability, under our sole discretion.
        </p>

        <h2>Limitation of Liability</h2>
        <p>
          In no event shall skriuw, its directors, employees, partners, agents, suppliers, 
          or affiliates be liable for any indirect, incidental, special, consequential, 
          or punitive damages.
        </p>

        <h2>Governing Law</h2>
        <p>
          These Terms shall be interpreted and governed by the laws of the jurisdiction in 
          which skriuw operates, without regard to conflict of law provisions.
        </p>

        <h2>Changes to Terms</h2>
        <p>
          We reserve the right to modify or replace these Terms at any time. If a revision 
          is material, we will provide at least 30 days notice prior to any new terms taking effect.
        </p>

        <h2>Contact Information</h2>
        <p>
          If you have any questions about these Terms of Service, please contact us.
        </p>
      </div>
    </div>
  )
}
