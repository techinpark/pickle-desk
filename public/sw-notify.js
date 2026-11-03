// 서비스 워커에 붙는 알림 클릭 처리: 열려 있는 앱 창을 앞으로 가져오거나 새로 연다.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
