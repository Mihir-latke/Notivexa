import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SITE_NAME = 'Notivexa'
const BASE_URL = 'https://notivexa.com'
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`

export default function SEOHead({
  title = 'AI Academic Intelligence & Study Platform',
  description = 'Transform your textbooks, PDFs, and video links into realistic handwritten notes, structured diagrams, Bloom’s Taxonomy question papers, smart flashcards, and audio lectures.',
  canonical,
  ogType = 'website',
  keywords = 'AI notes, handwritten notes generator, academic PDF, study planner, exam question paper, flashcards, lecture audio, MCA, B.Tech, NCERT'
}) {
  const location = useLocation()
  const cleanPath = canonical || location.pathname
  const canonicalUrl = `${BASE_URL}${cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`}`
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`

  useEffect(() => {
    // 1. Update Document Title
    document.title = fullTitle

    // Helper to get or create a meta/link tag
    const setMeta = (attr, key, content) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`)
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, key)
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }

    // 2. Standard Meta Tags
    setMeta('name', 'description', description)
    setMeta('name', 'keywords', keywords)
    setMeta('name', 'author', 'Notivexa Academic Intelligence')
    setMeta('name', 'robots', 'index, follow')

    // 3. OpenGraph Tags
    setMeta('property', 'og:site_name', SITE_NAME)
    setMeta('property', 'og:type', ogType)
    setMeta('property', 'og:title', fullTitle)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', canonicalUrl)
    setMeta('property', 'og:image', DEFAULT_IMAGE)
    setMeta('property', 'og:locale', 'en_US')

    // 4. Twitter Card Tags
    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', fullTitle)
    setMeta('name', 'twitter:description', description)
    setMeta('name', 'twitter:image', DEFAULT_IMAGE)
    setMeta('name', 'twitter:site', '@notivexa')

    // 5. Canonical Link Tag
    let canonLink = document.querySelector('link[rel="canonical"]')
    if (!canonLink) {
      canonLink = document.createElement('link')
      canonLink.setAttribute('rel', 'canonical')
      document.head.appendChild(canonLink)
    }
    canonLink.setAttribute('href', canonicalUrl)

    // 6. Invisible BreadcrumbList JSON-LD in <head> for Search Engines (zero UI impact)
    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': [
        {
          '@type': 'ListItem',
          'position': 1,
          'name': 'Home',
          'item': `${BASE_URL}/dashboard`
        },
        {
          '@type': 'ListItem',
          'position': 2,
          'name': fullTitle.replace(` | ${SITE_NAME}`, ''),
          'item': canonicalUrl
        }
      ]
    }
    let breadcrumbScript = document.getElementById('schema-breadcrumbs')
    if (!breadcrumbScript) {
      breadcrumbScript = document.createElement('script')
      breadcrumbScript.id = 'schema-breadcrumbs'
      breadcrumbScript.type = 'application/ld+json'
      document.head.appendChild(breadcrumbScript)
    }
    breadcrumbScript.textContent = JSON.stringify(breadcrumbLd)
  }, [fullTitle, description, canonicalUrl, ogType, keywords])

  return null
}
