import { useParams } from 'react-router';

export function Room() {
  const { code } = useParams<{ code: string }>();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold">Room {code}</h1>
      <p className="mt-2 text-gray-500">Waiting for peers…</p>
    </main>
  );
}
