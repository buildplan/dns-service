try {
    const storedTheme = localStorage.getItem('theme');
    const isLight = storedTheme === 'light';
    document.documentElement.classList.toggle('dark', !isLight);
    const schemeMeta = document.querySelector('meta[name="color-scheme"]');
    if (schemeMeta) schemeMeta.content = isLight ? 'light' : 'dark';
} catch (_) {
    document.documentElement.classList.add('dark');
}
