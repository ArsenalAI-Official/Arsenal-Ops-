// Parse YYYY-MM-DD string to local Date object (avoids UTC timezone issues)
export const parseLocalDate = (dateString: string | undefined): Date | undefined => {
    if (!dateString) return undefined;
    const [year, month, day] = dateString.split('-');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
};

// Format a Date as YYYY-MM-DD in local time
export const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
