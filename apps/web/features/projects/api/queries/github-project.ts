import { ProjectGithub } from '../../types/projects'

type RepoResponse = {
	html_url: string
	license?: { spdx_id?: string }
	stargazers_count: number
	forks_count: number
	created_at: string
	updated_at: string
}

export async function getRepoData(repo: ProjectGithub) {
	const response = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
		headers: {
			Accept: 'application/vnd.github+json',
		},
		next: { revalidate: 3600 },
	})
	if (!response.ok) {
		return null
	}
	const json = (await response.json()) as RepoResponse
	return {
		url: json.html_url,
		license: json.license?.spdx_id && json.license.spdx_id !== 'NOASSERTION' ? json.license.spdx_id : undefined,
		stars: json.stargazers_count,
		forks: json.forks_count,
		createdAt: json.created_at,
		updatedAt: json.updated_at,
	}
}
