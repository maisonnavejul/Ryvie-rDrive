import React, { useState, useEffect } from 'react';
import { Table, Input, Space, Tag, Avatar, Typography, Card, Spin, Alert, Button } from 'antd';
import { SearchOutlined, UserOutlined, TeamOutlined, ReloadOutlined } from '@ant-design/icons';
import { useUserCompanyList } from '@features/users/hooks/use-user-company-list';
import { UserType } from '@features/users/types/user';
import Languages from '@features/global/services/languages-service';
import moment from 'moment';

const { Title, Text } = Typography;
const { Search } = Input;

interface UsersListProps {
  onClose?: () => void;
}

const UsersList: React.FC<UsersListProps> = ({ onClose }) => {
  const users = useUserCompanyList();
  const [filteredUsers, setFilteredUsers] = useState<UserType[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (users.length > 0) {
      setFilteredUsers(users);
      setLoading(false);
    } else {
      // Attendre un peu pour le chargement initial
      const timer = setTimeout(() => {
        setLoading(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [users]);

  useEffect(() => {
    if (searchText) {
      const filtered = users.filter(user =>
        `${user.first_name} ${user.last_name}`.toLowerCase().includes(searchText.toLowerCase()) ||
        user.email.toLowerCase().includes(searchText.toLowerCase()) ||
        user.username.toLowerCase().includes(searchText.toLowerCase())
      );
      setFilteredUsers(filtered);
    } else {
      setFilteredUsers(users);
    }
  }, [searchText, users]);

  const getStatusTag = (user: UserType) => {
    const status = user.status_icon?.[0] || user.status || 'offline';
    if (status === 'online') {
      return <Tag color="green">En ligne</Tag>;
    } else if (status === 'away') {
      return <Tag color="orange">Absent</Tag>;
    } else if (status === 'busy') {
      return <Tag color="red">Occupé</Tag>;
    } else {
      return <Tag color="default">Hors ligne</Tag>;
    }
  };

  const getUserRole = (user: UserType) => {
    if (user.companies && user.companies.length > 0) {
      const company = user.companies[0];
      if (company.role === 'admin') {
        return <Tag color="blue">Administrateur</Tag>;
      } else if (company.role === 'member') {
        return <Tag color="cyan">Membre</Tag>;
      }
    }
    return <Tag color="default">Utilisateur</Tag>;
  };

  const handleRefresh = () => {
    setLoading(true);
    window.location.reload();
  };

  const columns = [
    {
      title: 'Utilisateur',
      dataIndex: 'user',
      key: 'user',
      width: '50%',
      fixed: 'left' as const,
      render: (_: any, user: UserType) => (
        <Space size="middle">
          <Avatar 
            src={user.thumbnail} 
            icon={<UserOutlined />}
            size="large"
            style={{ flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ 
              fontWeight: 'bold', 
              fontSize: '14px',
              lineHeight: '20px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {user.first_name} {user.last_name}
            </div>
            <div style={{ 
              color: '#666', 
              fontSize: '12px', 
              marginTop: '2px',
              lineHeight: '16px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {user.email}
            </div>
            <div style={{ 
              color: '#999', 
              fontSize: '11px', 
              marginTop: '1px',
              lineHeight: '14px'
            }}>
              @{user.username}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Rôle',
      dataIndex: 'role',
      key: 'role',
      width: '25%',
      align: 'center' as const,
      render: (_: any, user: UserType) => getUserRole(user),
    },
    {
      title: 'Dernière activité',
      dataIndex: 'last_activity',
      key: 'last_activity',
      width: '25%',
      align: 'center' as const,
      render: (lastActivity: number) => (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', lineHeight: '18px' }}>
            {lastActivity ? moment(lastActivity).format('DD/MM/YYYY') : 'Jamais'}
          </div>
          <div style={{ color: '#666', fontSize: '11px', lineHeight: '14px' }}>
            {lastActivity ? moment(lastActivity).format('HH:mm') : ''}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div style={{ 
      height: '100vh', 
      maxHeight: '90vh', 
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <Card style={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        margin: '0',
        border: 'none',
        boxShadow: 'none'
      }}>
        <div style={{ 
          marginBottom: '20px', 
          padding: '20px 24px 0 24px',
          borderBottom: '1px solid #f0f0f0',
          paddingBottom: '16px'
        }}>
          <Title level={2} style={{ margin: 0, marginBottom: '8px' }}>
            <TeamOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
            Users
          </Title>
          <Text type="secondary">
            Visualisez tous les utilisateurs de votre organisation
          </Text>
        </div>

        <div style={{ 
          marginBottom: '16px', 
          padding: '0 24px',
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '16px' 
        }}>
          <Search
            placeholder="Rechercher un utilisateur..."
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ maxWidth: '400px' }}
            prefix={<SearchOutlined />}
          />
          
          <Button 
            icon={<ReloadOutlined />} 
            onClick={handleRefresh}
            loading={loading}
          >
            Actualiser
          </Button>
        </div>

        <div style={{ marginBottom: '16px', padding: '0 24px' }}>
          <Text strong>
            Total: {filteredUsers.length} utilisateur{filteredUsers.length > 1 ? 's' : ''}
          </Text>
        </div>

        <div style={{ 
          flex: 1, 
          overflow: 'hidden',
          padding: '0 24px 24px 24px'
        }}>
          {loading ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '50px',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <Spin size="large" />
              <div style={{ marginTop: '16px' }}>
                <Text>Chargement des utilisateurs...</Text>
              </div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div style={{ 
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%'
            }}>
              <Alert
                message="Aucun utilisateur trouvé"
                description="Il n'y a aucun utilisateur dans votre organisation ou une erreur s'est produite lors du chargement."
                type="info"
                showIcon
                style={{ maxWidth: '400px' }}
                action={
                  <Button onClick={handleRefresh}>
                    Réessayer
                  </Button>
                }
              />
            </div>
          ) : (
            <Table
              columns={columns}
              dataSource={filteredUsers}
              rowKey="id"
              pagination={{
                pageSize: 15,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) =>
                  `${range[0]}-${range[1]} sur ${total} utilisateurs`,
                position: ['bottomCenter']
              }}
              scroll={{ 
                y: 'calc(100vh - 300px)',
                x: 800 
              }}
              size="middle"
              style={{ height: '100%' }}
            />
          )}
        </div>
      </Card>
    </div>
  );
};

export default UsersList;
