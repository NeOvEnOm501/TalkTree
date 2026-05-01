import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  TextInput,
  Modal,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { IScheme } from '../types';
import { getSchemes, saveSchemes } from '../storage';

type Props = NativeStackScreenProps<RootStackParamList, 'SchemeList'>;

export default function SchemeListScreen({ navigation }: Props) {
  const [schemes, setSchemes] = useState<IScheme[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const loadSchemes = useCallback(async () => {
    const data = await getSchemes();
    setSchemes(data);
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadSchemes();
    });
    return unsubscribe;
  }, [navigation, loadSchemes]);

  const handleCreate = () => {
    setNewTitle('');
    setModalVisible(true);
  };

  const confirmCreate = async () => {
    const title = newTitle.trim();
    if (!title) {
      Alert.alert('Название не может быть пустым');
      return;
    }
    const newScheme: IScheme = {
      id: Date.now().toString(),
      title,
      nodes: [
        {
          id: Date.now().toString() + '-root',
          text: 'Тема разговора',
          parentId: null,
          type: 'continue',
        },
      ],
      createdAt: Date.now(),
    };
    const updated = [...schemes, newScheme];
    await saveSchemes(updated);
    setSchemes(updated);
    setModalVisible(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Удалить схему?', 'Это действие нельзя отменить', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          const updated = schemes.filter((s) => s.id !== id);
          await saveSchemes(updated);
          setSchemes(updated);
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: IScheme }) => (
    <TouchableOpacity
      style={styles.schemeItem}
      onPress={() => navigation.navigate('Scheme', { schemeId: item.id })}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.schemeTitle}>{item.title}</Text>
        <Text style={styles.schemeDate}>
          {new Date(item.createdAt).toLocaleString()}
        </Text>
      </View>
      <TouchableOpacity onPress={() => handleDelete(item.id)}>
        <Text style={styles.deleteButton}>Удалить</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {schemes.length === 0 ? (
        <Text style={styles.emptyText}>Нет сохранённых схем</Text>
      ) : (
        <FlatList
          data={schemes}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
        />
      )}
      <TouchableOpacity style={styles.addButton} onPress={handleCreate}>
        <Text style={styles.addButtonText}>+</Text>
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Название схемы</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Введите название"
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={confirmCreate}
              >
                <Text>Создать</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
    color: '#888',
  },
  schemeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  schemeTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  schemeDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  deleteButton: {
    color: 'red',
    marginLeft: 16,
  },
  addButton: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  addButtonText: {
    fontSize: 28,
    color: 'white',
    lineHeight: 30,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    marginBottom: 16,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginLeft: 8,
  },
  cancelButton: {
    backgroundColor: '#eee',
  },
  confirmButton: {
    backgroundColor: '#007AFF',
  },
});