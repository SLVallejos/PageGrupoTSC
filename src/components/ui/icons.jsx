// Mapa centralizado de íconos: nombre lógico usado en src/data -> componente Lucide.
// Mantener este archivo como único punto de mapeo evita repetir imports de
// lucide-react en cada componente y facilita cambiar un ícono en toda la web.
import {
  Network, Video, Wifi, IdCard, Phone, Milestone, ShieldCheck, Target, Rocket,
  Headphones, Award, Cpu, Wrench, Landmark, Check, Clock, Mail, MapPin,
  TriangleAlert, Send, Menu, X, ChevronLeft, ChevronRight, ChevronDown, DoorOpen, Server,
  Ticket, Lock, User,
} from 'lucide-react';

export const iconMap = {
  network: Network,
  video: Video,
  wifi: Wifi,
  idBadge: IdCard,
  idCard: IdCard,
  phone: Phone,
  route: Milestone,
  shield: ShieldCheck,
  target: Target,
  rocket: Rocket,
  headset: Headphones,
  medal: Award,
  cpu: Cpu,
  tools: Wrench,
  landmark: Landmark,
  check: Check,
  clock: Clock,
  mail: Mail,
  mapPin: MapPin,
  alert: TriangleAlert,
  send: Send,
  menu: Menu,
  close: X,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  doorOpen: DoorOpen,
  server: Server,
  ticket: Ticket,
  lock: Lock,
  user: User,
};

export function Icon({ name, className = '', size = 20, strokeWidth = 2 }) {
  const Cmp = iconMap[name];
  if (!Cmp) return null;
  return <Cmp className={className} size={size} strokeWidth={strokeWidth} />;
}
