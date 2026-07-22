package webhooks

import "sync"

// Store holds the in-memory persistence stand-ins. A real integration would
// back these with a database: the processed-events set gives idempotency across
// redeliveries, and the business-state map is the record you fulfill against.
type Store struct {
	mu              sync.Mutex
	processedEvents map[string]struct{}
	businessState   map[string]string
}

// NewStore returns an empty store.
func NewStore() *Store {
	return &Store{
		processedEvents: make(map[string]struct{}),
		businessState:   make(map[string]string),
	}
}

// MarkProcessed returns true the first time an event id is seen; false for any
// redelivery.
func (s *Store) MarkProcessed(eventID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, seen := s.processedEvents[eventID]; seen {
		return false
	}
	s.processedEvents[eventID] = struct{}{}
	return true
}

// HasProcessed reports whether an event id has already been handled.
func (s *Store) HasProcessed(eventID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, seen := s.processedEvents[eventID]
	return seen
}

// SetResourceState records the reconciled state of a resource (the fulfillable
// source of truth).
func (s *Store) SetResourceState(resourceID, state string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.businessState[resourceID] = state
}

// ResourceState returns the recorded state of a resource, if any.
func (s *Store) ResourceState(resourceID string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	state, ok := s.businessState[resourceID]
	return state, ok
}
