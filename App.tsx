import { useState } from 'react';
import { Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { SessionCard } from './src/api/types';
import SessionListScreen from './src/screens/SessionListScreen';
import ChatScreen from './src/screens/ChatScreen';
import FilesScreen from './src/screens/FilesScreen';

// Two screens, one bit of state. A tapped card becomes `selected` and we
// show the conversation; back clears it. Kept dependency-light on purpose
// (no react-navigation). Files opens on top as a full-screen sheet, so the
// chat underneath keeps its state; `files.path` is a path tapped in a chat.
export default function App() {
  const [selected, setSelected] = useState<SessionCard | null>(null);
  const [files, setFiles] = useState<{ path: string | null } | null>(null);
  const openFiles = (path: string | null = null) => setFiles({ path });

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {selected ? (
        <ChatScreen session={selected} onBack={() => setSelected(null)} onOpenFiles={openFiles} />
      ) : (
        <SessionListScreen onOpen={setSelected} onOpenFiles={() => openFiles()} />
      )}
      <Modal
        visible={files !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setFiles(null)}
      >
        {files ? <FilesScreen initialPath={files.path} onClose={() => setFiles(null)} /> : null}
      </Modal>
    </SafeAreaProvider>
  );
}
