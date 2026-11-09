export const useRouter = () => ({ push: (url: string) => { document.body.dataset.destination = url; } });
