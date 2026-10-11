import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme';
import { PaneHeader } from '../../components/common';
import { useRemoteConfig } from '../../services/remoteConfig/RemoteConfigProvider';
import { NotificationCard } from './NotificationCard';
import { paneStyles } from './paneStyles';

/** The rail selects on focus, so only count a visit once the pane has stayed open a moment. */
const MARK_READ_DELAY_MS = 1200;
/** Height hidden under the absolutely positioned TopBar. */
const TOP_BAR_CLEARANCE = 76;

export interface NotificationsPaneProps {
  isActive: boolean;
}

export const NotificationsPane: React.FC<NotificationsPaneProps> = ({ isActive }) => {
  const { announcements, readAnnouncementIds, markAnnouncementsRead } = useRemoteConfig();
  // Items that were unread when this visit started keep their marker until the pane is left.
  const [newThisVisit, setNewThisVisit] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const listYRef = useRef(0);
  const cardYRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!isActive) {
      setNewThisVisit([]);
      setExpandedIds([]);
      return;
    }
    const unread = announcements
      .filter(a => !readAnnouncementIds.includes(a.id))
      .map(a => a.id);
    if (unread.length === 0) return;
    const timer = setTimeout(() => {
      setNewThisVisit(prev => [...prev, ...unread.filter(id => !prev.includes(id))]);
      markAnnouncementsRead(unread);
    }, MARK_READ_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isActive, announcements, readAnnouncementIds, markAnnouncementsRead]);

  const isNew = (id: string) => newThisVisit.includes(id) || !readAnnouncementIds.includes(id);

  const toggle = (id: string) => {
    const isCollapsing = expandedIds.includes(id);
    setExpandedIds(prev => (isCollapsing ? prev.filter(x => x !== id) : [...prev, id]));
    // Collapsing while scrolled into a long body would leave the card above the screen.
    const cardTop = listYRef.current + (cardYRef.current[id] ?? 0) - TOP_BAR_CLEARANCE - spacing.sm;
    if (isCollapsing && cardTop < scrollYRef.current) {
      scrollRef.current?.scrollTo({ y: Math.max(0, cardTop), animated: true });
    }
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={paneStyles.scroll}
      contentContainerStyle={paneStyles.content}
      onScroll={e => {
        scrollYRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={32}
    >
      <PaneHeader title="Notifications" subtitle="News and updates about Remos Player" />

      {announcements.length === 0 ? (
        <View style={paneStyles.card}>
          <Text style={styles.emptyTitle}>No notifications</Text>
          <Text style={paneStyles.mutedText}>
            Announcements about Remos Player will appear here.
          </Text>
        </View>
      ) : (
        <View
          style={styles.list}
          onLayout={e => {
            listYRef.current = e.nativeEvent.layout.y;
          }}
        >
          {announcements.map(item => (
            <NotificationCard
              key={item.id}
              item={item}
              isNew={isNew(item.id)}
              expanded={expandedIds.includes(item.id)}
              onToggle={() => toggle(item.id)}
              onLayout={e => {
                cardYRef.current[item.id] = e.nativeEvent.layout.y;
              }}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
});
