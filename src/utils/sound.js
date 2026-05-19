export const playNotification = () => {

  const audio = new Audio(
    "/sounds/notification.mp3"
  );

  audio.play();
};