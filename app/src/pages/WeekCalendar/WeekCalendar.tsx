import { useNavigate } from 'react-router-dom';
import WeekCalendarView from './WeekCalendarView';

/** Dedicated full-page placement of the week calendar (route `/week`). The
 *  calendar engine + all behavior live in WeekCalendarView, shared verbatim
 *  with the inline dashboard section. */
const WeekCalendar = () => {
  const navigate = useNavigate();
  return <WeekCalendarView layout="page" onNavigateBack={() => navigate('/')} />;
};

export default WeekCalendar;
