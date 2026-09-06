/**
 * One horizontal measure for the whole app — header, every screen, and both sticky action
 * bars use this. Keeping it in a single constant is what stops the header column from
 * drifting out of line with the content column at wide viewports.
 *
 * Reading measure (how long a line of prose is allowed to get) is a separate concern and
 * stays local to the text that needs it, e.g. `max-w-[60ch]` on the question stem.
 */
export const SHELL = 'mx-auto w-full max-w-shell px-4 sm:px-6';
