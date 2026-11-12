import { useState } from 'react';
import { Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { SessionCard } from './src/api/types';
import SessionListScreen from './src/screens/SessionListScreen';
import ChatScreen from './src/screens/ChatScreen';
import FilesScreen from './src/screens/FilesScreen';
import NewSessionScreen from './src/screens/NewSessionScreen';
import ProcessesScreen from './src/screens/ProcessesScreen';

// Three screens, two bits of state. A tapped card becomes `selected` and we
// show the conversation; back clears it. `creating` shows the new-session
// form, which hands over the started session as `selected`. Kept
// dependency-light on purpose (no react-navigation). Files opens on top as
// a full-screen sheet, so the chat underneath keeps its state;
// `files.path` is a path tapped in a chat.
export default function App() {
  const [selected, setSelected] = useState<SessionCard | null>(null);
  const [creating, setCreating] = useState(false);
  const [showProcesses, setShowProcesses] = useState(false);
  const [files, setFiles] = useState<{ path: string | null } | null>(null);
  const openFiles = (path: string | null = null) => setFiles({ path });

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {selected ? (
        <ChatScreen session={selected} onBack={() => setSelected(null)} onOpenFiles={openFiles} />
      ) : creating ? (
        <NewSessionScreen
          onBack={() => setCreating(false)}
          onCreated={(card) => {
            setCreating(false);
            setSelected(card);
          }}
        />
      ) : (
        <SessionListScreen
          onOpen={setSelected}
          onOpenFiles={() => openFiles()}
          onNew={() => setCreating(true)}
          onOpenProcesses={() => setShowProcesses(true)}
        />
      )}
      <Modal
        visible={showProcesses}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowProcesses(false)}
      >
        {showProcesses ? <ProcessesScreen onClose={() => setShowProcesses(false)} /> : null}
      </Modal>
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
