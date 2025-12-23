import type { Metadata } from 'next'
import { Project } from '../types/projects'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://skriuw.app'

export function overviewMetadata(): Metadata {
	const url = `${siteUrl}/projects`
	return {
		title: 'Projects | Skriuw',
		description: 'Curated work across sync, editors, and workflow systems built for resilient UX.',
		alternates: { canonical: url },
		openGraph: {
			title: 'Projects | Skriuw',
			description: 'Curated work across sync, editors, and workflow systems built for resilient UX.',
			url,
			type: 'website',
		},
		twitter: {
			card: 'summary_large_image',
			title: 'Projects | Skriuw',
			description: 'Curated work across sync, editors, and workflow systems built for resilient UX.',
		},
	}
}

export function projectMetadata(project: Project): Metadata {
	const url = `${siteUrl}/projects/${project.slug}`
	return {
		title: `${project.title} | Skriuw`,
		description: project.summary,
		alternates: { canonical: url },
		openGraph: {
			title: `${project.title} | Skriuw`,
			description: project.summary,
			url,
			type: 'article',
			images: project.media?.type === 'image' || project.media?.type === 'gif' ? [{ url: project.media.src, alt: project.media.alt }] : undefined,
		},
		twitter: {
			card: 'summary_large_image',
			title: `${project.title} | Skriuw`,
			description: project.summary,
		},
	}
}

export function projectJsonLd(project: Project) {
	return {
		'@context': 'https://schema.org',
		'@type': 'SoftwareApplication',
		name: project.title,
		description: project.summary,
		applicationCategory: project.categories.join(', '),
		operatingSystem: 'All',
		url: `${siteUrl}/projects/${project.slug}`,
		image: project.media?.src,
		offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
		datePublished: project.dates.start,
		dateModified: project.dates.end ?? project.dates.start,
		softwareVersion: '1.0.0',
	}
}
