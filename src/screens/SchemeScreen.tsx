import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { INode, IScheme, IDrink } from '../types';
import { getSchemes, saveSchemes } from '../storage';
import Svg, { Line } from 'react-native-svg';

type Props = NativeStackScreenProps<RootStackParamList, 'Scheme'>;

interface PositionedNode extends INode {
  x: number;
  y: number;
}

const NODE_WIDTH = 150;
const NODE_HEIGHT = 80;
const VERTICAL_GAP = 140;
const BRANCH_OFFSET = 160;
const MIN_BRANCH_DISTANCE = NODE_WIDTH + 30;

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;

function calculateLayout(nodes: INode[]): PositionedNode[] {
  const map = new Map<string, INode>();
  nodes.forEach((n) => map.set(n.id, n));

  const root = nodes.find((n) => n.parentId === null);
  if (!root) return [];

  const positioned: PositionedNode[] = [];

  const traverse = (nodeId: string, x: number, y: number) => {
    const node = map.get(nodeId);
    if (!node) return;
    positioned.push({ ...node, x, y });

    const children = nodes.filter((n) => n.parentId === nodeId);
    if (children.length === 0) return;

    const continues = children.filter((n) => n.type === 'continue');
    const branches = children.filter((n) => n.type === 'branch');
    const ordered = [...continues, ...branches];

    ordered.forEach((child, index) => {
      const slotY = y - VERTICAL_GAP * (index + 1);

      if (child.type === 'continue') {
        traverse(child.id, x, slotY);
      } else {
        const branchIndex = branches.indexOf(child);
        const direction = branchIndex % 2 === 0 ? 1 : -1;
        const safeOffset = Math.max(BRANCH_OFFSET, MIN_BRANCH_DISTANCE);
        let branchX = x + direction * safeOffset;
        if (Math.abs(branchX) < MIN_BRANCH_DISTANCE) {
          branchX = (branchX >= 0 ? 1 : -1) * MIN_BRANCH_DISTANCE;
        }
        traverse(child.id, branchX, slotY);
      }
    });
  };

  traverse(root.id, 0, 0);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  positioned.forEach((n) => {
    if (n.x < minX) minX = n.x;
    if (n.x + NODE_WIDTH > maxX) maxX = n.x + NODE_WIDTH;
    if (n.y < minY) minY = n.y;
    if (n.y + NODE_HEIGHT > maxY) maxY = n.y + NODE_HEIGHT;
  });

  const HORIZONTAL_PADDING = 200;
  const VERTICAL_PADDING = 300;
  const offsetX = HORIZONTAL_PADDING - minX;
  const offsetY = VERTICAL_PADDING - minY;

  return positioned.map((n) => ({
    ...n,
    x: n.x + offsetX,
    y: n.y + offsetY,
  }));
}

// Мини-модалка для выбора категории (используется в редактировании)
const CategoryPicker = ({
  visible,
  onSelect,
  onCancel,
}: {
  visible: boolean;
  onSelect: (cat: IDrink['category']) => void;
  onCancel: () => void;
}) => (
  <Modal visible={visible} transparent animationType="fade">
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Категория</Text>
        {(['рюмка', 'бутылка 0.5', 'коктейль'] as IDrink['category'][]).map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.modalButton, styles.confirmButton, { marginVertical: 5 }]}
            onPress={() => onSelect(cat)}
          >
            <Text style={{ color: 'white', textAlign: 'center' }}>{cat}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.modalButton, styles.cancelButton, { marginTop: 10 }]} onPress={onCancel}>
          <Text>Отмена</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

export default function SchemeScreen({ route, navigation }: Props) {
  const { schemeId } = route.params;
  const [scheme, setScheme] = useState<IScheme | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editDrinks, setEditDrinks] = useState<IDrink[]>([]);
  const [showTypeMenu, setShowTypeMenu] = useState(false);

  // Состояния для добавления напитка внутри модалки редактирования
  const [addDrinkMode, setAddDrinkMode] = useState(false);
  const [newDrinkCategory, setNewDrinkCategory] = useState<IDrink['category']>('рюмка');
  const [newDrinkName, setNewDrinkName] = useState('');
  const [newDrinkAmount, setNewDrinkAmount] = useState('');
  const [showEditCategoryPicker, setShowEditCategoryPicker] = useState(false);

  // Состояния для создания нового узла
  const [pendingNodeText, setPendingNodeText] = useState('');
  const [pendingNodeType, setPendingNodeType] = useState<'continue' | 'branch' | null>(null);
  const [drinkSetupVisible, setDrinkSetupVisible] = useState(false);
  const [step, setStep] = useState<'ask' | 'add'>('ask');
  const [tempDrinks, setTempDrinks] = useState<IDrink[]>([]);
  const [drinkCategoryCreate, setDrinkCategoryCreate] = useState<IDrink['category']>('рюмка');
  const [drinkNameCreate, setDrinkNameCreate] = useState('');
  const [drinkAmountCreate, setDrinkAmountCreate] = useState('');
  const [showCategoryPickerCreate, setShowCategoryPickerCreate] = useState(false);

  const lastTapRef = useRef<Record<string, number>>({});
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5,
      onPanResponderGrant: () => pan.extractOffset(),
      onPanResponderMove: (_, gestureState) =>
        pan.setValue({ x: gestureState.dx, y: gestureState.dy }),
      onPanResponderRelease: () => pan.flattenOffset(),
    })
  ).current;

  const loadScheme = useCallback(async () => {
    const all = await getSchemes();
    const found = all.find((s) => s.id === schemeId);
    if (found) {
      const nodesWithDrinks = found.nodes.map((n) => ({
        ...n,
        drinks: n.drinks || [],
      }));
      setScheme({ ...found, nodes: nodesWithDrinks });
      if (nodesWithDrinks.length > 0 && !activeNodeId) {
        setActiveNodeId(nodesWithDrinks[0].id);
      }
    }
  }, [schemeId]);

  useEffect(() => {
    loadScheme();
  }, [loadScheme]);

  const saveCurrentScheme = async (updatedScheme: IScheme) => {
    setScheme(updatedScheme);
    const all = await getSchemes();
    const updatedAll = all.map((s) => (s.id === schemeId ? updatedScheme : s));
    await saveSchemes(updatedAll);
  };

  // --- СОЗДАНИЕ НОВОГО УЗЛА ---
  const handleChooseType = (type: 'continue' | 'branch') => {
    setShowTypeMenu(false);
    setPendingNodeType(type);
    setEditingNodeId('__new__');          // <-- ВАЖНО! Помечаем, что создаём новый
    setEditText('');
    setEditModalVisible(true);
  };

  const confirmNewNodeText = () => {
    const text = editText.trim();
    if (!text) {
      Alert.alert('Тема не может быть пустой');
      return;
    }
    setPendingNodeText(text);
    setEditModalVisible(false);
    setEditingNodeId(null);
    setDrinkSetupVisible(true);
    setStep('ask');
  };

  const skipDrinks = () => {
    if (!scheme || !pendingNodeType || !activeNodeId || !pendingNodeText) return;
    const newNode: INode = {
      id: Date.now().toString(),
      text: pendingNodeText,
      parentId: activeNodeId,
      type: pendingNodeType,
      drinks: [],
    };
    const updatedNodes = [...scheme.nodes, newNode];
    saveCurrentScheme({ ...scheme, nodes: updatedNodes });
    setActiveNodeId(newNode.id);
    resetCreateState();
  };

  const startAddingDrinkCreate = () => {
    setStep('add');
    setDrinkCategoryCreate('рюмка');
    setDrinkNameCreate('');
    setDrinkAmountCreate('');
    setTempDrinks([]);
  };

  const addCurrentDrinkCreate = () => {
    const name = drinkNameCreate.trim();
    const amount = parseInt(drinkAmountCreate, 10);
    if (!name || isNaN(amount) || amount <= 0) {
      Alert.alert('Введите название и целое положительное число');
      return;
    }
    const newDrink: IDrink = { category: drinkCategoryCreate, name, amount };
    setTempDrinks((prev) => [...prev, newDrink]);
    setDrinkNameCreate('');
    setDrinkAmountCreate('');
    // Остаёмся на шаге 'add', чтобы можно было добавить ещё
  };

  const finishWithDrinks = () => {
    if (!scheme || !pendingNodeType || !activeNodeId || !pendingNodeText) return;
    const newNode: INode = {
      id: Date.now().toString(),
      text: pendingNodeText,
      parentId: activeNodeId,
      type: pendingNodeType,
      drinks: tempDrinks,
    };
    const updatedNodes = [...scheme.nodes, newNode];
    saveCurrentScheme({ ...scheme, nodes: updatedNodes });
    setActiveNodeId(newNode.id);
    resetCreateState();
  };

  const resetCreateState = () => {
    setPendingNodeText('');
    setPendingNodeType(null);
    setDrinkSetupVisible(false);
    setTempDrinks([]);
    setStep('ask');
  };

  // --- РЕДАКТИРОВАНИЕ СУЩЕСТВУЮЩЕГО УЗЛА ---
  const startEditing = (nodeId: string, currentText: string, currentDrinks: IDrink[]) => {
    setEditingNodeId(nodeId);
    setEditText(currentText);
    setEditDrinks([...currentDrinks]);
    setAddDrinkMode(false);
    setEditModalVisible(true);
  };

  const confirmEdit = () => {
    if (!scheme || !editingNodeId || editingNodeId === '__new__') return;
    const text = editText.trim();
    if (!text) {
      Alert.alert('Тема не может быть пустой');
      return;
    }
    const updatedNodes = scheme.nodes.map((n) =>
      n.id === editingNodeId ? { ...n, text, drinks: editDrinks } : n
    );
    const updatedScheme = { ...scheme, nodes: updatedNodes };
    saveCurrentScheme(updatedScheme);
    setEditModalVisible(false);
    setEditingNodeId(null);
    setAddDrinkMode(false);
  };

  const removeEditDrink = (index: number) => {
    setEditDrinks((prev) => prev.filter((_, i) => i !== index));
  };

  const startAddDrinkInEdit = () => {
    setAddDrinkMode(true);
    setNewDrinkCategory('рюмка');
    setNewDrinkName('');
    setNewDrinkAmount('');
  };

  const addDrinkToEdit = () => {
    const name = newDrinkName.trim();
    const amount = parseInt(newDrinkAmount, 10);
    if (!name || isNaN(amount) || amount <= 0) {
      Alert.alert('Введите название и целое положительное число');
      return;
    }
    const newDrink: IDrink = { category: newDrinkCategory, name, amount };
    setEditDrinks((prev) => [...prev, newDrink]);
    setAddDrinkMode(false); // возвращаемся к списку
    setNewDrinkName('');
    setNewDrinkAmount('');
  };

  const cancelAddDrinkMode = () => {
    setAddDrinkMode(false);
  };

  // --- НАКОПЛЕНИЕ НАПИТКОВ ---
  const getAccumulatedDrinks = (nodeId: string): IDrink[] => {
    if (!scheme) return [];
    const map = new Map(scheme.nodes.map((n) => [n.id, n]));
    const drinksMap = new Map<string, { category: string; name: string; amount: number }>();

    let cur: string | null = nodeId;
    const chain: string[] = [];
    while (cur) {
      chain.unshift(cur);
      const parent = map.get(cur)?.parentId;
      cur = parent || null;
    }

    chain.forEach((id) => {
      const node = map.get(id);
      if (node && node.drinks) {
        node.drinks.forEach((d) => {
          const key = `${d.category}|${d.name}`;
          const existing = drinksMap.get(key);
          if (existing) {
            existing.amount += d.amount;
          } else {
            drinksMap.set(key, { ...d });
          }
        });
      }
    });

    return Array.from(drinksMap.values()).map((d) => ({
      category: d.category as IDrink['category'],
      name: d.name,
      amount: d.amount,
    }));
  };

  const handleDeleteActiveNode = () => {
    if (!scheme || !activeNodeId) return;
    const activeNode = scheme.nodes.find((n) => n.id === activeNodeId);
    if (!activeNode) return;
    if (activeNode.parentId === null) {
      Alert.alert('Нельзя удалить корневой блок');
      return;
    }
    Alert.alert('Удалить блок?', 'Все дочерние блоки также будут удалены.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          const getAllDescendants = (id: string): string[] => {
            const children = scheme.nodes.filter((n) => n.parentId === id);
            return children.reduce((acc, c) => [...acc, c.id, ...getAllDescendants(c.id)], [] as string[]);
          };
          const idsToRemove = [activeNodeId, ...getAllDescendants(activeNodeId)];
          const updatedNodes = scheme.nodes.filter((n) => !idsToRemove.includes(n.id));
          const updatedScheme = { ...scheme, nodes: updatedNodes };
          setActiveNodeId(updatedNodes.length > 0 ? updatedNodes[0].id : null);
          await saveCurrentScheme(updatedScheme);
        },
      },
    ]);
  };

  const positionedNodes = scheme ? calculateLayout(scheme.nodes) : [];
  const nodeMap = new Map<string, PositionedNode>();
  positionedNodes.forEach((n) => nodeMap.set(n.id, n));

  useEffect(() => {
    const root = positionedNodes.find((n) => n.parentId === null);
    if (root) {
      const startX = windowWidth / 2 - (root.x + NODE_WIDTH / 2);
      const startY = windowHeight * 0.8 - (root.y + NODE_HEIGHT / 2);
      pan.setValue({ x: startX, y: startY });
    }
  }, [positionedNodes]);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  positionedNodes.forEach((n) => {
    if (n.x < minX) minX = n.x;
    if (n.x + NODE_WIDTH > maxX) maxX = n.x + NODE_WIDTH;
    if (n.y < minY) minY = n.y;
    if (n.y + NODE_HEIGHT > maxY) maxY = n.y + NODE_HEIGHT;
  });
  const contentWidth = Math.max(400, maxX - minX + 400);
  const contentHeight = Math.max(600, maxY - minY + 400);

  const renderDrinksSummary = (drinks: IDrink[]) => {
    if (!drinks || drinks.length === 0) return null;
    const emoji: Record<string, string> = {
      'рюмка': '🥃',
      'бутылка 0.5': '🍺',
      'коктейль': '🍹',
    };
    return (
      <Text style={styles.drinksText}>
        {drinks.map((d, i) => (
          <Text key={i}>{emoji[d.category] || ''}{d.name} x{d.amount}{i < drinks.length - 1 ? ' ' : ''}</Text>
        ))}
      </Text>
    );
  };

  return (
    <View style={styles.container}>
      <Animated.View
        style={{
          width: contentWidth,
          height: contentHeight,
          position: 'relative',
          transform: pan.getTranslateTransform(),
        }}
        {...panResponder.panHandlers}
      >
        <Svg style={StyleSheet.absoluteFill}>
          {positionedNodes.map((node) => {
            if (!node.parentId) return null;
            const parent = nodeMap.get(node.parentId);
            if (!parent) return null;
            const x1 = parent.x + NODE_WIDTH / 2;
            const y1 = parent.y + NODE_HEIGHT / 2;
            const x2 = node.x + NODE_WIDTH / 2;
            const y2 = node.y + NODE_HEIGHT / 2;
            return (
              <Line key={`${node.parentId}-${node.id}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#999" strokeWidth="2" />
            );
          })}
        </Svg>

        {positionedNodes.map((node) => {
          const isActive = node.id === activeNodeId;
          const text = node.text || 'Без названия';
          const accumulated = getAccumulatedDrinks(node.id);
          return (
            <TouchableOpacity
              key={node.id}
              activeOpacity={0.7}
              onPress={() => {
                const now = Date.now();
                const last = lastTapRef.current[node.id] || 0;
                if (now - last < 300) {
                  startEditing(node.id, node.text, node.drinks);
                  lastTapRef.current[node.id] = 0;
                } else {
                  setActiveNodeId(node.id);
                  lastTapRef.current[node.id] = now;
                }
              }}
              style={[
                styles.nodeBlock,
                {
                  left: node.x,
                  top: node.y,
                  borderColor: isActive ? '#007AFF' : '#ccc',
                  borderWidth: isActive ? 3 : 1,
                },
              ]}
            >
              <Text numberOfLines={2} style={styles.nodeText}>{text}</Text>
              {renderDrinksSummary(accumulated)}
              {isActive && (
                <TouchableOpacity style={styles.deleteNodeBtn} onPress={handleDeleteActiveNode}>
                  <Text style={{ color: 'red' }}>🗑</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        })}
      </Animated.View>

      <TouchableOpacity style={styles.addButton} onPress={() => setShowTypeMenu(true)}>
        <Text style={styles.addButtonText}>+</Text>
      </TouchableOpacity>

      {showTypeMenu && (
        <View style={styles.typeMenu}>
          <TouchableOpacity style={styles.typeMenuButton} onPress={() => handleChooseType('continue')}>
            <Text>Продолжить тему</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.typeMenuButton} onPress={() => handleChooseType('branch')}>
            <Text>Ответвление</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.typeMenuButton, { backgroundColor: '#eee' }]} onPress={() => setShowTypeMenu(false)}>
            <Text>Отмена</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Модалка темы (для создания и редактирования) */}
      <Modal visible={editModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingNodeId === '__new__' ? 'Новая тема' : 'Редактировать блок'}
            </Text>
            <TextInput style={styles.modalInput} value={editText} onChangeText={setEditText} autoFocus />

            {/* Редактирование существующего узла */}
            {editingNodeId && editingNodeId !== '__new__' && (
              <View style={{ marginTop: 10 }}>
                {!addDrinkMode ? (
                  <>
                    <Text style={{ fontWeight: '600', marginBottom: 5 }}>Напитки (локальные):</Text>
                    {editDrinks.map((d, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                        <Text>{d.category}: {d.name} x{d.amount}</Text>
                        <TouchableOpacity onPress={() => removeEditDrink(idx)} style={{ marginLeft: 10 }}>
                          <Text style={{ color: 'red' }}>Удалить</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity onPress={startAddDrinkInEdit} style={{ marginTop: 5 }}>
                      <Text style={{ color: '#007AFF' }}>+ Добавить напиток</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  /* Форма добавления напитка при редактировании */
                  <View>
                    <TouchableOpacity
                      style={[styles.modalButton, { alignSelf: 'center', marginBottom: 10 }]}
                      onPress={() => setShowEditCategoryPicker(true)}
                    >
                      <Text>{newDrinkCategory}</Text>
                    </TouchableOpacity>
                    <TextInput style={styles.modalInput} placeholder="Название" value={newDrinkName} onChangeText={setNewDrinkName} />
                    <TextInput style={styles.modalInput} placeholder="Количество" value={newDrinkAmount} onChangeText={setNewDrinkAmount} keyboardType="numeric" />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={cancelAddDrinkMode}>
                        <Text>Отмена</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={addDrinkToEdit}>
                        <Text>Добавить этот напиток</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

            <View style={{ marginTop: 20 }} />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => { setEditModalVisible(false); setEditingNodeId(null); }}>
                <Text>Отмена</Text>
              </TouchableOpacity>
              {editingNodeId === '__new__' ? (
                <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={confirmNewNodeText}>
                  <Text>Далее</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={confirmEdit}>
                  <Text>Сохранить</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Модалка создания напитков (после темы нового узла) */}
      {drinkSetupVisible && (
        <Modal visible transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
            {step === 'ask' ? (
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Добавить напитки?</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 }}>
                  <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={skipDrinks}>
                    <Text>Нет</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={startAddingDrinkCreate}>
                    <Text>Да</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* Форма добавления напитков при создании */
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Добавить напиток</Text>
                <TouchableOpacity
                  style={[styles.modalButton, { alignSelf: 'center', marginBottom: 10 }]}
                  onPress={() => setShowCategoryPickerCreate(true)}
                >
                  <Text>{drinkCategoryCreate}</Text>
                </TouchableOpacity>
                <TextInput style={styles.modalInput} placeholder="Название" value={drinkNameCreate} onChangeText={setDrinkNameCreate} />
                <TextInput style={styles.modalInput} placeholder="Количество" value={drinkAmountCreate} onChangeText={setDrinkAmountCreate} keyboardType="numeric" />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                  <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={addCurrentDrinkCreate}>
                    <Text>Добавить этот напиток</Text>
                  </TouchableOpacity>
                </View>
                {tempDrinks.length > 0 && (
                  <View style={{ marginTop: 15 }}>
                    <Text style={{ fontWeight: '600', marginBottom: 5 }}>Добавлено:</Text>
                    {tempDrinks.map((d, i) => (
                      <Text key={i}>{d.category}: {d.name} x{d.amount}</Text>
                    ))}
                    <TouchableOpacity style={{ marginTop: 15 }} onPress={finishWithDrinks}>
                      <Text style={{ color: '#007AFF', textAlign: 'center', fontWeight: 'bold', fontSize: 16 }}>Готово, создать тему</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Выбор категории для редактирования */}
      <CategoryPicker
        visible={showEditCategoryPicker}
        onSelect={(cat) => { setNewDrinkCategory(cat); setShowEditCategoryPicker(false); }}
        onCancel={() => setShowEditCategoryPicker(false)}
      />

      {/* Выбор категории для создания */}
      <CategoryPicker
        visible={showCategoryPickerCreate}
        onSelect={(cat) => { setDrinkCategoryCreate(cat); setShowCategoryPickerCreate(false); }}
        onCancel={() => setShowCategoryPickerCreate(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  nodeBlock: {
    position: 'absolute',
    width: NODE_WIDTH,
    minHeight: NODE_HEIGHT,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  nodeText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#333',
    marginBottom: 2,
  },
  drinksText: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    marginTop: 2,
  },
  deleteNodeBtn: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 2,
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
  typeMenu: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  typeMenuButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
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
    maxHeight: '80%',
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