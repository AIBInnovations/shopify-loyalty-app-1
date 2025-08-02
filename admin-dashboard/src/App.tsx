import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppProvider } from '@shopify/polaris';
import { Frame, Navigation, TopBar } from '@shopify/polaris';
import {
  HomeIcon,
  PersonIcon,
  SettingsIcon,
  ChartVerticalIcon,
  StarIcon
} from '@shopify/polaris-icons';

// Import components
import Dashboard from './components/Dashboard.tsx';
import CustomerLookup from './components/CustomerLookup.tsx';
import PointsManager from './components/PointsManager.tsx';
import Analytics from './components/Analytics.tsx';
import Configuration from './components/Configuration.tsx';

// Polaris theme
import '@shopify/polaris/build/esm/styles.css';

function App() {
  const [selectedNavigation, setSelectedNavigation] = React.useState(0);

  const navigationMarkup = (
    <Navigation location="/">
      <Navigation.Section
        items={[
          {
            label: 'Dashboard',
            icon: HomeIcon,
            selected: selectedNavigation === 0,
            onClick: () => setSelectedNavigation(0),
            url: '/'
          },
          {
            label: 'Analytics',
            icon: ChartVerticalIcon,
            selected: selectedNavigation === 1,
            onClick: () => setSelectedNavigation(1),
            url: '/analytics'
          },
          {
            label: 'Customer Lookup',
            icon: PersonIcon,
            selected: selectedNavigation === 2,
            onClick: () => setSelectedNavigation(2),
            url: '/customers'
          },
          {
            label: 'Points Manager',
            icon: StarIcon,
            selected: selectedNavigation === 3,
            onClick: () => setSelectedNavigation(3),
            url: '/points'
          },
          {
            label: 'Configuration',
            icon: SettingsIcon,
            selected: selectedNavigation === 4,
            onClick: () => setSelectedNavigation(4),
            url: '/settings'
          }
        ]}
      />
    </Navigation>
  );

  const topBarMarkup = (
    <TopBar
      showNavigationToggle
    />
  );

  return (
    <AppProvider
      i18n={{
        Polaris: {
          Common: {
            checkbox: 'checkbox',
            undo: 'Undo',
            cancel: 'Cancel',
            clear: 'Clear',
            close: 'Close',
            submit: 'Submit',
            more: 'More'
          },
          ResourceList: {
            sortingLabel: 'Sort by',
            defaultItemSingular: 'item',
            defaultItemPlural: 'items',
            showing: 'Showing {itemsCount} {resource}',
            Item: {
              viewItem: 'View details for {itemName}'
            }
          }
        }
      }}
    >
      <Router>
        <Frame
          topBar={topBarMarkup}
          navigation={navigationMarkup}
          showMobileNavigation={false}
          onNavigationDismiss={() => {}}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/customers" element={<CustomerLookup />} />
            <Route path="/points" element={<PointsManager />} />
            <Route path="/settings" element={<Configuration />} />
          </Routes>
        </Frame>
      </Router>
    </AppProvider>
  );
}

export default App;