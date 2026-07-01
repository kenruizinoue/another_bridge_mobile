import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { SessionCard } from './src/api/types';
import SessionListScreen from './src/screens/SessionListScreen';
import ChatScreen from './src/screens/ChatScreen';

// Two screens, one bit of state. A tapped card becomes `selected` and we
// show the conversation; back clears it. Kept dependency-light on purpose
// (no react-navigation) — this is a dev tool with exactly two views.
export default function App() {
  const [selected, setSelected] = useState<SessionCard | null>(null);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {selected ? (
        <ChatScreen session={selected} onBack={() => setSelected(null)} />
      ) : (
        <SessionListScreen onOpen={setSelected} />
      )}
    </SafeAreaProvider>
  );
}
