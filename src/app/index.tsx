import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import * as SQLite from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
const setupNotificationChannel = async () => {
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Task Reminders',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });
};

const dbPromise = SQLite.openDatabaseAsync('todo.db');

type Task = {
  id: number;
  text: string;
  completed: boolean;
  dueDate: string | null;
};

export default function HomeScreen() {
  const [task, setTask] = useState('');
  const [dueDate, setDueDate] = useState(new Date());
const [showDatePicker, setShowDatePicker] = useState(false);
const [reminderTime, setReminderTime] = useState(new Date());
const [showTimePicker, setShowTimePicker] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [taskFilter, setTaskFilter] = useState<'All' | 'Pending' | 'Completed'>('All');
  const [tasks, setTasks] = useState<Task[]>([]);
  const today = new Date().toISOString().split('T')[0];
  const [isDarkMode, setIsDarkMode] = useState(false);

const isOverdue = (item: Task) => {
  return (
    item.dueDate !== null &&
    item.dueDate < today &&
    !item.completed
  );
};

const isDueToday = (item: Task) => {
  return (
    item.dueDate === today &&
    !item.completed
  );
};
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [dbReady, setDbReady] = useState(false);

  // Apply both the search text and the selected task-status filter.
  const totalTasks = tasks.length;

const completedTasks = tasks.filter(
  (item) => item.completed
).length;

const pendingTasks = totalTasks - completedTasks;
  const progressPercentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
  const filteredTasks = tasks.filter((item) => {
    const matchesSearch = item.text
      .toLowerCase()
      .includes(searchText.trim().toLowerCase());

    const matchesStatus =
      taskFilter === 'All' ||
      (taskFilter === 'Pending' && !item.completed) ||
      (taskFilter === 'Completed' && item.completed);

    return matchesSearch && matchesStatus;
  });

  // Initialize SQLite and load saved tasks
  useEffect(() => {
    async function initializeDatabase() {
      try {
        const db = await dbPromise;

        await db.execAsync(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    dueDate TEXT
  );
`);

await db.execAsync(`
  ALTER TABLE tasks ADD COLUMN dueDate TEXT;
`).catch(() => {});

        // Migrate existing AsyncStorage tasks if the database is empty.
        const result = await db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) AS count FROM tasks'
        );

        if (result?.count === 0) {
          const savedTasks = await AsyncStorage.getItem('tasks');

          if (savedTasks) {
            const oldTasks: { text: string; completed: boolean }[] =
              JSON.parse(savedTasks);

            for (const item of oldTasks) {
              await db.runAsync(
                'INSERT INTO tasks (text, completed) VALUES (?, ?)',
                item.text,
                item.completed ? 1 : 0
              );
            }
          }
        }

        await loadTasks();
      } catch (error) {
        console.error('Database initialization failed:', error);
Alert.alert('Database Error', String(error));
      } finally {
        setDbReady(true);
      }
    }

    initializeDatabase();
  }, []);

  // Read tasks from SQLite
  async function loadTasks() {
    const db = await dbPromise;

    const rows = await db.getAllAsync<{
  id: number;
  text: string;
  completed: number;
  dueDate: string | null;
}>('SELECT * FROM tasks ORDER BY id DESC');

    setTasks(
  rows.map((row) => ({
    id: row.id,
    text: row.text,
    completed: row.completed === 1,
    dueDate: row.dueDate,
  }))
);
  }

  // Add a task
  async function addTask() {
    const trimmedText = task.trim();

    if (!trimmedText) {
      Alert.alert('Missing task', 'Please enter a task first.');
      return;
    }

    try {
      const db = await dbPromise;

      await db.runAsync(
  'INSERT INTO tasks (text, completed, dueDate) VALUES (?, 0, ?)',
  trimmedText,
  dueDate.toISOString().split('T')[0]
);

      setTask('');
      await loadTasks();
    } catch (error) {
      console.error('Add task failed:', error);
      Alert.alert('Error', 'Could not add the task.');
    }
  }

  const sendTestNotification = async () => {
  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();

  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } =
      await Notifications.requestPermissionsAsync();

    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    alert('Notification permission was not granted.');
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'TodoReminder 🔔',
      body: 'Your test notification is working!',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
    },
  });

  alert('Test notification scheduled! It will appear in 5 seconds.');
};


const scheduleTaskReminder = async (item: Task) => {
  if (item.completed) {
    alert('This task is already completed!');
    return;
  }

  if (!item.dueDate) {
    alert('Please select a due date for this task.');
    return;
  }

  const { status } = await Notifications.requestPermissionsAsync();

  if (status !== 'granted') {
    alert('Please allow notifications in Android settings.');
    return;
  }

const reminderDate = new Date(item.dueDate + 'T00:00:00');

reminderDate.setHours(
  reminderTime.getHours(),
  reminderTime.getMinutes(),
  0,
  0
);
  if (reminderDate.getTime() <= Date.now()) {
    alert('Please choose a future due date for the reminder.');
    return;
  }

await setupNotificationChannel();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔔 TodoReminder',
      body: `Reminder: ${item.text}`,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderDate,
    },
  });

  alert('Reminder scheduled for 9:00 AM on ' + item.dueDate);
};
  // Mark a task complete or incomplete
  async function toggleTask(item: Task) {
    try {
      const db = await dbPromise;

      await db.runAsync(
        'UPDATE tasks SET completed = ? WHERE id = ?',
        item.completed ? 0 : 1,
        item.id
      );

      await loadTasks();
    } catch (error) {
      console.error('Update task failed:', error);
    }
  }

  // Save an edited task
  async function saveEdit() {
    const trimmedText = editText.trim();

    if (editingId === null || !trimmedText) {
      Alert.alert('Invalid task', 'Please enter some text.');
      return;
    }

    try {
      const db = await dbPromise;

      await db.runAsync(
        'UPDATE tasks SET text = ? WHERE id = ?',
        trimmedText,
        editingId
      );

      setEditingId(null);
      setEditText('');
      await loadTasks();
    } catch (error) {
      console.error('Edit task failed:', error);
      Alert.alert('Error', 'Could not edit the task.');
    }
  }

  // Delete a task
  async function deleteTask(id: number) {
    try {
      const db = await dbPromise;

      await db.runAsync('DELETE FROM tasks WHERE id = ?', id);

      if (editingId === id) {
        setEditingId(null);
        setEditText('');
      }

      await loadTasks();
    } catch (error) {
      console.error('Delete task failed:', error);
      Alert.alert('Error', 'Could not delete the task.');
    }
  }

  if (!dbReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading your tasks...</Text>
      </View>
    );
  }


return (
  <ScrollView
    style={{ flex: 1, backgroundColor: isDarkMode ? '#111827' : '#FCEAF0' }}
    contentContainerStyle={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#FCEAF0' }]}
    showsVerticalScrollIndicator
    keyboardShouldPersistTaps="handled"
  >
    {!isDarkMode && (
      <View pointerEvents="none" style={styles.colorfulBackdrop} />
    )}
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
        padding: 18,
        borderRadius: 22,
        backgroundColor: isDarkMode ? '#172554' : '#312E81',
        borderLeftWidth: 5,
        borderLeftColor: '#F59E0B',
        overflow: 'hidden',
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 2, color: '#A5F3FC', marginBottom: 5 }}>YOUR DAILY PLANNER</Text>
      <Text
        style={[
          styles.title,
          {
            color: '#FFFFFF',
            marginBottom: 0,
            flexShrink: 1,
          },
        ]}
      >
        TodoReminder
      </Text>
      <Text style={{ fontSize: 13, color: '#F8BBD0', marginTop: 5 }}>Small steps. Big progress.</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        onPress={() => setIsDarkMode((previous) => !previous)}
        style={{
          width: 42,
          height: 42,
          marginLeft: 12,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDarkMode ? '#293B68' : '#4338CA',
          borderWidth: 1,
          borderColor: '#818CF8',
        }}
      >
        <Text style={{ fontSize: 20 }}>
          {isDarkMode ? '☀️' : '🌙'}
        </Text>
      </Pressable>
    </View>


      <View style={[styles.sectionPanel, styles.createPanel, isDarkMode && darkStyles.sectionPanel]}>
      <Text style={[styles.sectionEyebrow, { color: isDarkMode ? '#F8BBD0' : '#4C1D95', backgroundColor: isDarkMode ? 'transparent' : 'rgba(255,255,255,0.72)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9 }]}>✦  CREATE A TASK</Text>
      <TextInput
        style={[styles.input, isDarkMode && darkStyles.input]}
        placeholder="Enter your task..."
        value={task}
        onChangeText={setTask}
        onSubmitEditing={addTask}
        returnKeyType="done"
      />

      <Pressable style={[styles.button, { width: '84%', alignSelf: 'center' }]} onPress={addTask}>
        <Text style={styles.buttonText}>Add Task</Text>
      </Pressable>
      <View style={[styles.dateTimeRow, { width: '84%', alignSelf: 'center' }]}>
        <Pressable
          style={[styles.dateTimeButton, isDarkMode && darkStyles.dateButton]}
          onPress={() => setShowDatePicker(true)}
        >
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.dateButtonText, isDarkMode && darkStyles.dateButtonText]}>
            📅 {dueDate.toLocaleDateString()}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.dateTimeButton, isDarkMode && darkStyles.dateButton]}
          onPress={() => setShowTimePicker(true)}
        >
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.dateButtonText, isDarkMode && darkStyles.dateButtonText]}>
            ⏰ {reminderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </Pressable>
      </View>
      </View>

{showTimePicker && (
  <DateTimePicker
    value={reminderTime}
    mode="time"
    display="default"
    onChange={(event, selectedTime) => {
      setShowTimePicker(false);

      if (event.type === 'set' && selectedTime) {
        setReminderTime(selectedTime);
      }
    }}
  />
)}


{showDatePicker && (
  <DateTimePicker
    value={dueDate}
    mode="date"
    display="default"
    onChange={(
      event: import('@react-native-community/datetimepicker').DateTimePickerEvent,
      selectedDate?: Date
    ) => {
      setShowDatePicker(false);

      if (event.type === 'set' && selectedDate) {
        setDueDate(selectedDate);
      }
    }}
  />
)}

      <View style={[styles.sectionPanel, styles.overviewPanel, isDarkMode && darkStyles.sectionPanel]}>
      <TextInput
        style={[styles.searchInput, isDarkMode && darkStyles.searchInput]}
        placeholder="Search tasks..."
        value={searchText}
        onChangeText={setSearchText}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />

      <View style={styles.filterRow}>
        {(['All', 'Pending', 'Completed'] as const).map((filter) => (
          <Pressable
            key={filter}
            style={[
              styles.filterButton,
              isDarkMode && darkStyles.filterButton,
              taskFilter === filter && styles.activeFilterButton,
            ]}
            onPress={() => setTaskFilter(filter)}
          >
            <Text
              style={[
                styles.filterButtonText,
                isDarkMode && darkStyles.filterButtonText,
                taskFilter === filter && styles.activeFilterButtonText,
              ]}
            >
              {filter}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.statsRow}>
  <View style={[styles.statCard, styles.totalCard, isDarkMode && darkStyles.statCard]}>
    <View style={[styles.statIcon, { backgroundColor: isDarkMode ? '#1D3557' : '#DBEAFE' }]}><Text style={{ fontSize: 16 }}>📋</Text></View>
    <Text style={[styles.statNumber, { color: isDarkMode ? '#F8FAFC' : '#1D4ED8' }]}>{totalTasks}</Text>
    <Text style={[styles.statLabel, isDarkMode && darkStyles.statLabel]}>Total</Text>
  </View>

  <View style={[styles.statCard, styles.pendingCard, isDarkMode && darkStyles.statCard]}>
    <View style={[styles.statIcon, { backgroundColor: isDarkMode ? '#4A2C1A' : '#FFEDD5' }]}><Text style={{ fontSize: 16 }}>◷</Text></View>
    <Text style={[styles.statNumber, { color: isDarkMode ? '#FDBA74' : '#C2410C' }]}>{pendingTasks}</Text>
    <Text style={[styles.statLabel, isDarkMode && darkStyles.statLabel]}>Pending</Text>
  </View>

  <View style={[styles.statCard, styles.completedCard, isDarkMode && darkStyles.statCard]}>
    <View style={[styles.statIcon, { backgroundColor: isDarkMode ? '#123C35' : '#D1FAE5' }]}><Text style={{ fontSize: 16 }}>✓</Text></View>
    <Text style={[styles.statNumber, { color: isDarkMode ? '#6EE7B7' : '#047857' }]}>{completedTasks}</Text>
    <Text style={[styles.statLabel, isDarkMode && darkStyles.statLabel]}>Completed</Text>
  </View>
</View>

<View style={[styles.progressCard, { backgroundColor: isDarkMode ? '#1E293B' : '#F0E7FF', borderColor: isDarkMode ? '#334155' : '#C4B5FD' }]}>
  <View style={styles.progressHeader}>
    <View>
      <Text style={[styles.progressTitle, { color: isDarkMode ? '#F8FAFC' : '#0F172A' }]}>Your progress</Text>
      <Text style={[styles.progressCaption, { color: isDarkMode ? '#A7B0C0' : '#64748B' }]}>{completedTasks} of {totalTasks} tasks completed</Text>
    </View>
    <View style={[styles.progressBadge, { backgroundColor: isDarkMode ? '#163A32' : '#DCFCE7' }]}>
      <Text style={{ color: isDarkMode ? '#6EE7B7' : '#15803D', fontWeight: '800', fontSize: 16 }}>{progressPercentage}%</Text>
    </View>
  </View>
  <View style={[styles.progressTrack, { backgroundColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
    <View style={[styles.progressFill, { width: `${progressPercentage}%`, backgroundColor: '#8B5CF6' }]} />
  </View>
  <View style={styles.progressFooter}>
    <Text style={[styles.progressFooterText, { color: isDarkMode ? '#A7B0C0' : '#64748B' }]}>Keep it up — one task at a time.</Text>
    <Text style={[styles.progressFooterText, { color: isDarkMode ? '#A7B0C0' : '#64748B' }]}>{pendingTasks} left</Text>
  </View>
</View>
      </View>

<View style={[styles.sectionPanel, styles.tasksPanel, isDarkMode && darkStyles.sectionPanel]}>
<Text style={[styles.subtitle, isDarkMode && darkStyles.subtitle]}>
  My Tasks ({filteredTasks.length})
</Text>

      {tasks.length === 0 ? (
        <Text style={[styles.emptyText, isDarkMode && darkStyles.emptyText]}>No tasks yet. Add your first task!</Text>
      ) : filteredTasks.length === 0 ? (
        <Text style={[styles.emptyText, isDarkMode && darkStyles.emptyText]}>
          {searchText.trim()
            ? 'No tasks match your search and filter.'
            : `No ${taskFilter.toLowerCase()} tasks.`}
        </Text>
      ) : (
        filteredTasks.map((item, taskIndex) => {
          const taskAccentColors = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#3B82F6'];
          const taskAccent = taskAccentColors[taskIndex % taskAccentColors.length];
          return (
          <View key={item.id} style={styles.taskWithReminderRow}>
          <View style={[styles.taskRow, { flex: 1, minWidth: 0, backgroundColor: isDarkMode ? '#1E293B' : ['#F0F9FF', '#F0FDF4', '#FFF7ED', '#FDF2F8', '#F5F3FF', '#FFFBEB'][taskIndex % 6], borderColor: isDarkMode ? '#334155' : ['#F9C6D2', '#BBF7D0', '#FED7AA', '#FBCFE8', '#FBCFE8', '#FCE7F3'][taskIndex % 6], borderLeftColor: taskAccent }, isDarkMode && darkStyles.taskRow]}>
            {editingId === item.id ? (
              <View style={styles.editContainer}>
                <TextInput
                  style={[styles.editInput, isDarkMode && darkStyles.editInput]}
                  value={editText}
                  onChangeText={setEditText}
                  autoFocus
                  onSubmitEditing={saveEdit}
                />

                <Pressable onPress={saveEdit} style={styles.actionButton}>
                  <Text style={styles.saveText}>Save</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setEditingId(null);
                    setEditText('');
                  }}
                  style={styles.actionButton}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable
                  style={styles.taskContent}
                  onPress={() => toggleTask(item)}
                >
                  <Text
                    style={[
                      styles.taskItem,
                      item.completed && styles.completedTask,
                    ]}
                  >
                    {item.completed ? '✓  ' : '○  '}
                    {item.text}
                  </Text>
                  <Text style={[styles.dueDateText, isDarkMode && darkStyles.dueDateText]}>
                    📅 Due: {item.dueDate ?? 'No due date'}
                  </Text>
                  <View style={styles.taskMetaRow}>
                    {isOverdue(item) && (
                      <Text style={styles.overdueChip}>⚠ Overdue</Text>
                    )}
                    {isDueToday(item) && (
                      <Text style={styles.dueTodayChip}>● Due today</Text>
                    )}
                  </View>
                </Pressable>

                <Pressable
                  style={styles.actionButton}
                  onPress={() => {
                    setEditingId(item.id);
                    setEditText(item.text);
                  }}
                >
                  <Text style={styles.editText}>✏️</Text>
                </Pressable>

                <Pressable
                  style={styles.actionButton}
                  onPress={() =>
                    Alert.alert('Delete task', 'Are you sure?', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => deleteTask(item.id),
                      },
                    ])
                  }
                >
                  <Text style={styles.deleteText}>✕</Text>
                </Pressable>
              </>
            )}
          </View>
          <Pressable
            style={[styles.remindButton, isDarkMode && darkStyles.remindButton]}
            onPress={() => scheduleTaskReminder(item)}
          >
            <Text style={styles.remindButtonText}>🔔</Text>
            <Text style={styles.remindButtonText}>Remind</Text>
          </Pressable>
          </View>
          );
        })
      )}
      </View>
    </ScrollView>
  );
}

const darkStyles = StyleSheet.create({
  
  sectionPanel: { backgroundColor: '#172033', borderColor: '#334155' },
  remindButton: { backgroundColor: '#3F1D2A', borderColor: '#9F1239' },
  input: { backgroundColor: '#1E1E1E', borderColor: '#444444', color: '#F9FAFB' },
  searchInput: { backgroundColor: '#1E1E1E', borderColor: '#444444', color: '#F9FAFB' },
  dateButton: { backgroundColor: '#292D3E' },
  dateButtonText: { color: '#F8BBD0' },
  filterButton: { backgroundColor: '#1E1E1E', borderColor: '#444444' },
  filterButtonText: { color: '#D1D5DB' },
  statCard: { backgroundColor: '#1E1E1E', borderColor: '#444444' },
  statNumber: { color: '#F9FAFB' },
  statLabel: { color: '#D1D5DB' },
  subtitle: { color: '#F9FAFB' },
  emptyText: { color: '#D1D5DB' },
  taskRow: { backgroundColor: '#1E1E1E', borderColor: '#334155', borderLeftColor: '#818CF8' },
  taskItem: { color: '#F3F4F6' },
  dueDateText: { color: '#D1D5DB' },
  editInput: { backgroundColor: '#292929', borderColor: '#555555', color: '#F9FAFB' },
});

const styles = StyleSheet.create({
  sectionPanel: { borderRadius: 22, padding: 16, marginBottom: 16, borderWidth: 1, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  createPanel: { backgroundColor: '#FFF5F8', borderColor: '#F3D2DD' },
  overviewPanel: { backgroundColor: '#FFF4F7', borderColor: '#F3D2DD', marginTop: 4 },
  tasksPanel: { backgroundColor: '#FFF5F8', borderColor: '#F3D2DD', marginTop: 4 },
  remindButton: { width: 58, minHeight: 54, backgroundColor: '#FFF1F2', borderColor: '#FDA4AF', borderWidth: 1, paddingHorizontal: 5, paddingVertical: 7, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 3 },
  remindButtonText: { color: '#BE123C', fontSize: 10, fontWeight: '800' },
  colorfulBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FCEAF0' },
  diagonalBand: { position: 'absolute', width: 115, height: 1450, opacity: 0.42, borderRadius: 2 },
  container: {
    flexGrow: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 36,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0F5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#334155',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#243B53',
    marginBottom: 30,
  },
  sectionEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 9, marginTop: 2 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: '#D9E2EC',
    borderRadius: 14,
    padding: 15,
    fontSize: 16,
    marginBottom: 12,
    color: '#0F172A',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginTop: 18,
    color: '#0F172A',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  statsRow: {
  flexDirection: 'row',
  gap: 9,
  marginTop: 20,
},
  statIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  progressCard: { marginTop: 16, borderRadius: 18, padding: 17, borderWidth: 1, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  progressTitle: { fontSize: 17, fontWeight: '800' },
  progressCaption: { fontSize: 12, marginTop: 5 },
  progressBadge: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  progressTrack: { height: 9, borderRadius: 10, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#22C55E', borderRadius: 10 },
  progressFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 5 },
  progressFooterText: { fontSize: 11 },

statCard: {
  flex: 1,
  paddingVertical: 14,
  paddingHorizontal: 6,
  borderRadius: 16,
  alignItems: 'center',
  borderWidth: 1,
},

totalCard: {
  backgroundColor: '#EFF6FF',
  borderColor: '#93C5FD',
},

completedCard: {
  backgroundColor: '#ECFDF5',
  borderColor: '#6EE7B7',
},

pendingCard: {
  backgroundColor: '#FFF7ED',
  borderColor: '#FDBA74',
},

statNumber: {
  fontSize: 23,
  fontWeight: '700',
  color: '#1E293B',
},

statLabel: {
  fontSize: 11,
  fontWeight: '600',
  color: '#475569',
  marginTop: 4,
  textAlign: 'center',
},
  filterRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  activeFilterButton: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  filterButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
  activeFilterButtonText: {
    color: '#FFFFFF',
  },
  button: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  dateTimeButton: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#E0E7FF',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateButton: {
  backgroundColor: '#E0E7FF',
  paddingVertical: 9,
  paddingHorizontal: 10,
  borderRadius: 12,
  alignItems: 'center',
  marginTop: 7,
},

dateButtonText: {
  color: '#3730A3',
  fontSize: 13,
  fontWeight: '600',
},
  subtitle: {
    fontSize: 21,
    fontWeight: 'bold',
    color: '#243B53',
    marginTop: 30,
    marginBottom: 5,
  },
  emptyText: {
    color: '#64748B',
    marginTop: 15,
    fontSize: 15,
  },
  taskWithReminderRow: {
    width: '92%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginTop: 6,
    paddingVertical: 1,
    paddingRight: 3,
    paddingLeft: 2,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    borderLeftWidth: 4,
    borderLeftColor: '#6366F1',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  taskContent: {
    flex: 1,
    paddingBottom: 2,
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 5,
    marginLeft: 28,
    marginTop: 1,
    marginBottom: 1,
  },
  reminderChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#E0E7FF',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  reminderChipText: {
    color: '#3730A3',
    fontSize: 10,
    fontWeight: '700',
  },
  overdueChip: {
    color: '#B91C1C',
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: '800',
  },
  dueTodayChip: {
    color: '#92400E',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: '800',
  },
  taskItem: {
    fontSize: 14,
    color: '#334155',
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  completedTask: {
    textDecorationLine: 'line-through',
    color: '#94A3B8',
  },
  actionButton: {
    padding: 8,
  },
  editContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  editInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    padding: 8,
    color: '#334155',
  },
  saveText: {
    color: '#15803D',
    fontWeight: 'bold',
  },
  cancelText: {
    color: '#64748B',
  },
  editText: {
    fontSize: 18,
  },
  deleteText: {
    color: '#DC2626',
    fontSize: 18,
    fontWeight: 'bold',
  },
  dueDateText: {
  fontSize: 10,
  color: '#64748B',
  marginLeft: 28,
  marginTop: 1,
  marginBottom: 2,
},
overdueText: {
  color: '#DC2626',
  fontSize: 10,
  fontWeight: 'bold',
  marginLeft: 28,
  marginBottom: 2,
},

dueTodayText: {
  color: '#D97706',
  fontSize: 10,
  fontWeight: 'bold',
  marginLeft: 28,
  marginBottom: 2,
},
});