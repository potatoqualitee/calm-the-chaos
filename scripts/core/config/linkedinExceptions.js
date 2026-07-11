import linkedinExceptions from '../../../keywords/linkedin-exceptions.json';

// Keep this separate from the default catalog so content scripts do not bundle
// every category JSON file merely to read LinkedIn-specific exceptions.
export const LINKEDIN_EXCEPTIONS = linkedinExceptions;
