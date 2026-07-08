# 그룹 챗봇 스킬 서버 개발 Quick Start 가이드 - 39쪽 전체 학습본

- 원자료: Google Docs, 사용자 확인 기준 총 39쪽
- 문서 버전: 1.11.1
- 최종 수정일: 2026-04-20
- 전체 추출 문자 수: 23,680자
- 전체 추출 줄 수: 1,024줄
- 검증: 문서 전체 선택 추출을 두 차례 수행해 길이와 본문이 완전히 동일함을 확인
- 시작 표식: `그룹 챗봇 스킬 서버 개발 Quick Start 가이드`
- 종료 표식: 변경 이력 `1.0.0 최초 공개`

> Google Docs의 페이지 나눔 정보는 전체 텍스트 추출에 포함되지 않아 아래 본문은 페이지별이 아니라 원문 순서대로 제공합니다. 본문 누락 방지를 위해 중복 문단도 원자료 그대로 유지했습니다.

---

그룹 챗봇 스킬 서버 개발 Quick Start 가이드
버전: 1.11.1, 최종 수정일: 2026-04-20

소개
챗봇이 사용자 발화에 대해 적절한 응답을 동적으로 생성하기 위해서는 프로그래밍을 통한 스킬 서버 개발이 필수적입니다. 본 문서는 챗봇이 API로 응답을 생성할 수 있게하는 스킬과 챗봇이 먼저 대화를 시작할 수 있게하는 이벤트 API 사용 방법을 소개하는 Quick Start 가이드입니다. 두 기능은 유기적인 챗봇을 구축하는 데 중요한 요소로, 예제를 참고하여 사용해볼 수 있습니다. 먼저 스킬과 이벤트 API 사용 방법을 익혀보고 API, 챗봇 테스트 및 문제 해결 방법에 대해 다루겠습니다. 추가적인 정보는 팀채팅 챗봇 도움말과 챗봇 공식 도움말을 참고해 주세요.
▶ 챗봇 공식 도움말 바로가기

스킬 사용하기
챗봇이 사용자의 다양한 발화에 적절히 응답하려면 스킬 기능을 사용해야합니다. 스킬은 연결된 API를 통해 동적으로 챗봇의 응답 내용을 구성할 수 있게 합니다. 예를 들어 사용자가 “오늘 날씨 알려줘"라고 요청하면, 서버는 실시간 날씨 정보를 활용해서 챗봇의 응답을 생성할 수 있습니다. 지금부터 날씨 조회 스킬을 만들고 블록에 연결해서 챗봇 응답으로 사용해볼까요?
▶ 챗봇 공식 도움말 - 스킬 바로가기

그림 1. 봇이 스킬을 활용하여 응답하는 예시. “오늘 날씨 어때?”에 대해 실시간 날씨 정보를 제공할 수 있음.

스킬 생성 및 블록에 연결
챗봇이 스킬을 사용하려면 먼저 챗봇 관리자센터에서 스킬을 생성해야합니다. 챗봇 관리자센터 > 스킬 > 스킬 목록에서 [생성] 버튼을 눌러 스킬 생성 화면으로 이동합니다.

그림 2. 챗봇 관리자센터 스킬 목록 화면. 생성 버튼을 눌러 생성화면으로 이동할 수 있음.

스킬을 만들 때 필수 값인 스킬 이름과 URL을 입력하고 저장합니다. 이 URL은 스킬이 실행될 때 챗봇 서버가 URL을 body에 SkillRequest를 담아 POST Method로 호출합니다.

그림 3. 새로운 스킬 생성 화면. URL에는 스킬 실행시 호출할 스킬 서버의 URL을 입력.

방금 만든 ‘실시간 날씨 조회’ 스킬을 날씨 조회 블록에서 사용하기 위해서는 블록과 스킬을 연결해야합니다. [그림 4]와 같이 날씨 조회 블록에 들어가 ‘스킬 검색/선택'에서 ‘실시간 날씨 조회’를 선택하고 봇 응답 설정에서 ‘스킬데이터 사용’을 선택하고 저장합니다.

그림 4. 등록한 스킬을 블록에 연결. 스킬을 선택하고, 봇 응답으로 스킬데이터 사용을 선택.

이렇게 설정하면 사용자가 “오늘 날씨"라고 발화했을 때 “날씨 조회" 블록이 실행되고 그 과정에서 연결된 스킬인 “실시간 날씨 조회" 스킬이 실행됩니다. 스킬 실행은 SkillRequest를 등록된 URL로 전송하고, 스킬 서버가 응답하는 SkillResponse를 기반으로 챗봇의 응답이 만들어집니다.
위와 같이 설정한 후 카카오톡에서 챗봇에 “오늘 날씨 어때?”라고 발화하면 챗봇이 스킬 서버의 응답에 따른 동적인 응답을 할 수 있습니다.

그림 5. 봇이 스킬을 활용하여 실시간 날씨 정보를 응답하는 예시.

위 스킬에서 응답한 텍스트 말풍선(SimpleText) 외에도 텍스트 카드, 이미지 카드 등 다양한 응답을 사용해보세요. 이어지는 SkillRequest 및 SkillResponse 섹션에서 말풍선 꾸미는 방법을 확인해보세요. 

SkillRequest와 SkillResponse
❗유의사항: 
SkillRequest는 하위 호환성을 유지하면서 파라미터가 추가될 수 있습니다. 따라서 스킬 서버는 알 수 없는 필드(Unknown Field)가 있어도 예외를 발생시키지 않도록 처리해 주세요.
앞서 사용자 발화를 통해 블록에 연결된 스킬이 실행되고 그 결과로 챗봇의 응답이 만들어지는 것을 확인하였습니다. 스킬 서버는 SkillRequest를 받아 비즈니스 로직에 알맞게 처리하고 SkillResponse 형태로 응답하여 챗봇 응답을 만듭니다. SkillRequest와 SkillResponse 값을 잘 이해하면 더 유기적인 챗봇을 만들 수 있습니다.

SkillRequest
아래는 스킬 실행 시 URL로 전송되는 SkillRequest 예시입니다. 크게 bot, intent(block), action, userRequest, context로 구분되며 주요한 값에 대한 설명은 아래와 같습니다. 특히 사용자 식별키는 botUserKey, appUserId가 있어 사용자를 구분할 때 사용할 수 있습니다. 상세한 내용은 공식 문서를 참조하시기 바랍니다.
▶ 챗봇 공식 도움말 > SkillRequest 바로가기
{https://kakaobusiness.gitbook.io/main/tool/chatbot/skill_guide/answer_json_format#skillpayload
    "bot": {
        "id": "667e5382f2b2f84cb555091c!", … (1)
        "name": "가이드봇"
    },
    "intent": {
        "id": "670398cbef21cb53dd079dd9", … (2)
        "name": "날씨 조회"
    },
    "userRequest": {
        "utterance": "오늘 날씨 어때?", … (3)
        "user": {
            "id": "a19b8cd3404d56ff71890edcb9b0be8b6466fd0c6bae2c9b177f3fa12cf21dd9ae",
            "type": "botUserKey",
            "properties": {
                "botUserKey": "a19b8cd3404d56ff71890edcb9b0be8b6466fd0c6bae2c9b177f3fa12cf21dd9ae", … (4)
                "appUserId": "1801267359" … (5)
            }
        },
        "chat": {
            "id": "9debbb67ea55799b968dbc50f45d6feb36613e9297319bf57116860068b5035081",
            "type": "botGroupKey",
            "properties": {
                "botGroupKey": "9debbb67ea55799b968dbc50f45d6feb36613e9297319bf57116860068b5035081" … (6)
            }
        }
    },
    "action": {
        "id": "670398b5de0e6d687aa6db94",
        "name": "실시간 날씨 조회 스킬",
        "params": {
            "sys_date": "sys.date"
        },
        "detailParams": {
            "sys_date": {
                "groupName": "",
                "origin": "오늘", … (7)
                "value": "sys.date"
            }
        }
    }
}

표 1. SkillRequest 예시. 주요 항목 8가지에 대한 설명.
(1) 봇 ID 667e5382f2b2f84cb555091c! (맨 끝 !는 개발 채널인 경우 추가됨)
(2) 블록 ID 670398cbef21cb53dd079dd9
(3) 사용자 발화: 사용자가 채팅창에 입력한 발화 “오늘 날씨 어때?”
(4) botUserKey: 챗봇 기준 사용자 식별키. 동일한 사용자라도, 봇이 다르면 다른 ID가 발급됨
(5) appUserId: 카카오 디벨로퍼스 앱 기준 사용자 식별키,  카카오 로그인을 사용하는 유저인 경우 전달되는 키로 앱의 유저와 매핑 가능 (운영 채널과 개발 채널을 모두 연결해야함)
(6) botGroupKey: 채팅방 식별키
(7) 파라미터 추출 값. action.detailParams.sys_date.origin: “오늘"은 “오늘 날씨 어때?”에서 sys.date 시스템 엔티티로 “오늘"이 추출됨


SkillResponse
SkillResponse는 스킬 서버가 SkillRequest를 처리한 후 챗봇 응답을 구성하는 값입니다. 위 스킬 사용해기 예제에서는 스킬 서버가 아래와 같이 응답하도록 설정하였습니다.
{
  "template": {
    "outputs": [
      {
        "simpleText": {
          "text": "오늘 오전은 흐리며 오후에는 천둥 번개를 동반한 비가올 예정입니다."
        }
      }
    ]
  },
  "version": "2.0"
}

표 2. 스킬서버 응답 예시. SimpleText 말풍선을 출력.

SimpleText 외에도 팀채팅 챗봇에서 사용할 수 있는 다양한 말풍선이 있습니다. 응답 내용을 더 효과적으로 표현하고 싶으시다면 아래 표에서 사용 가능한 컴포넌트를 확인하시고, 해당 컴포넌트의 SkillResponse 응답을 공식 문서를 참고하여 구현하시기 바랍니다.
SkillResponse 팀채팅 추가 기능
SimpleText Markdown 말풍선 사용
{
  "template": {
    "outputs": [
      {
        "simpleText": {
          "text": "```println(“hello”)```",
          "extra": {
            "markdown": true
          }
        }
      }
    ]
  },
  "version": "2.0"
}

표 2. 스킬서버 응답 예시. SimpleText 말풍선을 Markdown으로 출력.
 

▶ 챗봇 공식 도움말 > SkillResponse > SkillTemplate 바로가기
컴포넌트 명
설명
사용 가능 여부
예시
SimpleText
간단 텍스트
O

SimpleImage
간단 이미지
O

TextCard
텍스트 카드
O

BasicCard
기본 카드
O

ListCard1)
리스트 카드
O

ItemCard
아이템 카드
O

QuickReplies
바로가기 그룹
X

CommerceCard
커머스 카드
X

Carousel
일렬로 카드를 포함하는 타입
X


표 3. 팀채팅 챗봇에서 사용 가능한 컴포넌트. QuickReplies, CommerceCard, Carousel은 미지원.

버튼이 포함된 모든 스킬 말풍선(TextCard, BasicCard, ListCard, ItemCard)에서는 buttonLayout 필드를 통해 버튼의 레이아웃을 제어할 수 있습니다. 
buttonLayout을 "horizontal"로 설정하면 버튼이 가로로 정렬되며, 최대 2개까지 노출됩니다.
buttonLayout을 "vertical"로 설정하면 버튼이 세로로 정렬되며, 최대 5개까지 노출됩니다.

1) ListCard의 경우 리스트를 노출하는 형태를 설정할 수 있습니다. listCard의 구성 필드에 이하와 같이 “listLayout” : “ranking” 필드를 추가하면 됩니다.
{
  "version": "2.0",
  "template": {
    "outputs": [
      {
        "listCard": {
          "listLayout": "ranking",
          "header": {
            "title": "챗봇 관리자센터를 소개합니다."
          },
          "items": [
            {
              "title": "챗봇 관리자센터",
              "description": "새로운 AI의 내일과 일상의 변화",
  …(중략)… 
}

챗봇 공식 도움말 문서의 ListCard 예제를 이용하면 이하와 같이 보여집니다.


기존 ListCard
ranking이 적용된 ListCard


플러그인
플러그인은 챗봇의 유저 경험을 향상시키기 위해 제공하는 빌트인 기능입니다. 플러그인은 설정 위치에 따라 봇 응답 버튼 플러그인과 파라미터 플러그인으로 구분됩니다.
봇 응답 버튼 플러그인
봇 응답 버튼 플러그인은 말풍선에 설정된 버튼을 클릭했을 때 특정 기능이나 동작을 실행할 수 있도록 지원하는 확장 기능입니다. 플러그인을 활용하면 공유(share), 초대(invite), 도움말(guide) 등 목적에 맞는 다양한 유저 액션을 제공할 수 있으며, 이를 통해 챗봇 활용도를 높일 수 있습니다.
▶ 챗봇 공식 도움말 > SkillResponse > Button 바로가기

스킬 응답 예시 (도움말 버튼)
아래는 도움말(guide) 버튼을 노출하는 스킬 응답 예시입니다.
{
  "version": "2.0",
  "template": {
    "outputs": [
      {
        "textCard": {
          "title": "도움말",
          "buttons": [
            {
              "label": "도움말",
              "action": "guide"
            }
          ]
        }
      }
    ]
  }
}



추가로 지원되는 action 타입은 아래 표를 참고해 주세요.
항목
Action 타입
설명
예시
도움말
guide
챗봇 도움말을 보여줌

공유하기
share
말풍선을 다른 채팅방에 공유

초대하기
invite
챗봇을 다른 채팅방에 초대

친구 초대하기
inviteMember
현재 채팅방에 다른 친구 초대


챗봇 멘션하기
mention
입력창에 챗봇 멘션이 입력됨

봇설정 바로가기
settings
챗봇 설정 페이지로 이동



프로모션용 초대 링크 Referer 추적 기능
유저가 초대하기 링크를 통해 챗봇을 채팅방에 입장시킬 경우, 초대시킨 유저의 ID와 초대된 방의 ID를 Webhook으로 수신하여 챗봇 초대자를 파악할 수 있습니다. Webhook 사용에 관한 설명은 채팅방 이벤트 Webhook을 참조해주세요.
챗봇 초대하기 링크는 버튼에 URL로 다음과 같이 설정합니다.
https://pf.kakao.com/{encoded_profile_id}/chatbot/invite?referer={referer}

encoded_profile_id는 아래 그림과 같이 카카오비즈니스 파트너센터에서 확인할 수 있습니다.
referer는 Webhook params에 전송될 값으로 목적에 맞게 설정할 수 있습니다.


챗봇이 채팅방에 새로 입장하는 경우, 이벤트 type은 "entrance"로 정의됩니다. payload 필드에는 초대한 사용자 정보(inviter)와 referer를 담은 추가 정보가 params가 포함됩니다.
JSON 예시는 아래와 같습니다.
{
    "botId": "64ddebb416baad579d7b7ef9",
    "type": "entrance",
    "timestamp": 1771923948483,
    "group": {
        "botGroupKey": "6fe1b4d6f04be431f07fb3c43ced522e833b5ed8b7779e3e13070272e58ecfa58b"
    },
    "payload": {
        "inviter": {
            "botUserKey": "0ddf4c64f45407c4bc6a1f00110fa74bcc486ab5680aac5ab036b7401bce2ccb74"
        },
        "params": {
            "referer": "promotion"
        }
    }
}



파라미터 플러그인
파라미터 플러그인은 파라미터 만들기 메뉴에서 설정할 수 있는 플러그인으로, 유저가 입력한 값을 스킬 서버를 통해 전달받을 수 있도록 지원합니다. 이를 통해 사용자는 채팅 흐름 안에서 시간 선택과 이미지 전송을 수행할 수 있습니다. 

설정 가능한 플러그인 종류는 아래와 같습니다.
항목
설명
예시
이미지 전송 플러그인
유저가 챗봇에 이미지를 전송할 수 있음 
▶ 상세 가이드 바로가기

시간 플러그인
유저가 챗봇에 시간을 전송할 수 있음



발화에서 멘션된 유저 식별하기
유저가 챗봇에게 멘션을 포함해서 발화하면, 챗봇은 멘션된 유저를 식별할 수 있고 이를 비즈니스 로직에 활용할 수 있습니다. 예를 들어 “@그룹봇 MBTI 궁합 @이하나 @진지혜”라고 발화하면 챗봇은 @이하나, @진지혜 두 유저의 식별자를 스킬 파라미터로 전달 받을 수 있습니다.

설정 방법
먼저 멘션 시스템 엔티티를 사용하려면 챗봇 관리자센터 상단 메뉴 ‘엔티티 → 시스템 엔티티’로 이동한 후, 목록 하단에 있는 @sys.user.mention을 활성화합니다.

그다음, 멘션 기능을 적용할 블록으로 이동해 패턴 발화를 입력한 뒤, 멘션 엔티티로 인식하고 싶은 부분을 드래그해서 sys.user.mention 엔티티로 태깅합니다. 예를 들어 “MBTI 궁합 @이지우 @김수지”로 입력했다면, @이지우와 @김수지를 선택해 태깅하면 됩니다. 태깅이 완료되면 아래 그림처럼 멘션 엔티티가 파라미터로 등록된 것을 확인할 수 있습니다.

이렇게 설정한 이후, 유저가 챗봇에 “MBTI 궁합 @OOO @OOO”과 같이 발화하면, 챗봇은 멘션된 유저의 식별자(예: botUserKey, appUserId)를 스킬 파라미터로 전달받을 수 있습니다.

특정 사용자를 멘션하여 응답하기
팀채팅 챗봇은 응답 시 채팅방에 참여한 특정 사용자를 멘션할 수 있습니다. [그림 6]은 “인증 순위”라는 발화에 대해 사용자를 멘션하면서 리더보드를 출력하는 예시입니다. 이 외에도 설문에 참여하지 않은 사용자를 멘션하는 등 특정 사용자를 호출해야 하는 다양한 시나리오에 활용할 수 있습니다.

그림 6. 챗봇 응답에서 사용자를 멘션하는 예시.
챗봇이 사용자를 멘션하기 위해서는 이전 섹션에서 설명한 SkillResponse에 멘션할 사용자 정보를 입력해야 합니다. 아래 SkillResponse는 [그림 6]을 출력하는 SkillResponse 예시입니다.
{
  "version": "2.0",
  "template": {
    "outputs": [
      {
        "simpleText": {
          "text": "🚀 주간 리더보드\n * 1위: {{#mentions.user1}}: 210점\n * 2위: {{#mentions.user2}}: 110점\n * 3위: {{#mentions.user3}}: 70점"
        }
      }
    ]
  },
  "extra": {
    "mentions": {
      "user1": {
        "type": "botUserKey",
        "id": "1139e39a6fd0c6b1dd"
      },
      "user2": {
        "type": "botUserKey",
        "id": "29708db65e8e141613"
      },
      "user3": {
        "type": "botUserKey",
        "id": "ae2c9b177f3fa12cf2"
      }
    }
  }
}

표 4. 멘션을 포함하여 응답하는 예시. simpleText.text에 멘션으로 치환할 부분을 {{#mentions.{userKey}}} 형태로 입력.
[표 4]와 같이 간단한 텍스트 응답에서는 simpleText.text에 내용을 입력하는데, 사용자 멘션은 넣을 부분은 {{#mentions.{userKey}}} 형식으로 입력합니다. userKey는 임의의 값으로 지정할 수 있으며, 이에 해당하는 실제 사용자 정보는 extra.mentions.{userKey}에 type과 id를 참조하여 실제 멘션으로 대체됩니다. 멘션에 필요한 구체적인 JSON 포맷은 아래 표를 참고해 주시기 바랍니다.
파라미터 이름
타입
필수 여부
허용 값
설명
template.outputs[].simpleText.text
String
O
문자열
간단 텍스트 응답 내용.
내용에서 멘션할 사용자를 {{#mentions.{userKey}}} 형식으로 입력 
extra.mentions.{userKey}
Object
O
문자열
simpleText.text에서 지정한 사용자 멘션 키
extra.mentions.{userKey}.type
String
O
"botUserKey" / "appUserId"
사용자 식별 ID 타입
extra.mentions.{userKey}.id
String
O
문자열
사용자 ID 값

표 5. 사용자를 멘션할 때 필요한 SkillResponse 형식.
❗유의사항: 
멘션 기능은 SimpleText 형식에만 동작합니다.
멘션은 한 응답에 최대 15명까지 가능합니다.

채팅방 상태 변경 알림 Webhook
채팅방에서 발생하는 주요 상태 변경은 Webhook을 통해 실시간으로 수신할 수 있으며, 현재 지원되는 알림은 다음과 같습니다.
챗봇이 채팅방에 입장하는 경우 (entrance)
챗봇이 채팅방에서 나가는 경우 (leave)
친구 초대 버튼으로 채팅방에 친구를 초대한 경우 (inviteMember)
해당 이벤트 발생 시, 사전에 등록된 Webhook URL로 HTTP POST 요청이 전송됩니다.

Webhook URL 등록
Webhook을 사용하려면 사전에 Webhook URL을 등록해야합니다. 담당자에게 Webhook 사용 신청 시 다음 정보를 함께 전달해 주세요.
봇 ID
Webhook URL (HTTPS 권장)
Header (필요 시)

Webhook 전송 방식 및 Payload 상세
Webhook 요청의 전송 방식과 전달되는 Payload의 상세 내용은 다음과 같습니다.
Method: POST
Content-Type: application/json
Body: JSON 형식
이벤트 유형에 따라 서로 다른 JSON Payload가 전달됩니다.

파라미터 이름
타입
필수 여부
설명
botId
String
O
봇 ID
type
String
O
채팅방 이벤트 타입 (entrance, leave)
group
Object
O
채팅방 정보
group.botGroupKey
String
O
이벤트가 발생한 채팅방 ID
payload
Map<String, Any>
X
이벤트 관련 추가 정보
timestamp
Long
O
이벤트 발생 시각 (Unix Epoch ms)

전송되는 JSON 예시는 다음과 같습니다.
{
    "botId": "64ddebb416baad579d7b7ef9",
    "type": "entrance",
    "group": {
        "botGroupKey": "6fe1b4d6f04be431f07fb3c43ced522e833b5ed8b7779e3e13070272e58ecfa58b"
    },
    "payload": {
        "inviter": {
            "botUserKey": "0ddf4c64f45407c4bc6a1f00110fa74bcc486ab5680aac5ab036b7401bce2ccb74"
        },
        "params": {
            "referer": "promotion"
        }
    },
    "timestamp": 1771923948483
}
챗봇 알림 기능
챗봇 알림 기능은 유저가 정기적인 메시지를 수신할 수 있도록 지원하며, 시스템상으로는 Event API를 호출하는 것과 동일하게 동작합니다. 
유저는 알림 설정을 통해 챗봇의 정기 메시지 수신 여부와 발송 시간을 직접 관리할 수 있습니다. 알림 설정 화면은 다음 두 가지 경로로 진입할 수 있습니다.
챗봇 응답 버튼 내 Settings 플러그인
채팅방 우측 사이드 메뉴

알림 기능 구현 가이드: 전용 블록 분리 가이드라인
알림 기능을 구현할 때는 일반 대화 블록과 분리하여 ‘알림 전용 블록’을 별도로 생성하여 사용하는 것을 권장합니다.
🚫 주의 사항
알림 전용 블록에는 일반 파라미터 및 필수 파라미터를 설정해서는 안 됩니다.
파라미터가 포함되지 않은 블록만 알림 용도로 사용할 수 있습니다.



💡 조건부 알림 구현 방법
특정 상황에서만 알림을 발송해야 하는 경우, 스킬 서버를 통해 발송을 제어해야 합니다.
구현 예시:
주말에는 알림을 안 보내고 싶은 경우
처리 흐름: 
     (1) 알림 스킬 요청을 받은 스킬 서버에서 현재 시간이나 특정 조건의 충족 여부를 판단합니다. 
     (2) 조건에 일치하는 경우에만 응답을 보냅니다. 일치하지 않는 경우는 빈 말풍선으로 응답합니다.

알림 항목 등록 방법
설정 화면에는 각 챗봇에 등록된 알림 항목이 노출되며, 유저는 토글 버튼으로 간편하게 알림을 켜고 끌 수 있습니다. 새로운 알림 항목을 등록하시려면 아래의 정보를 정리하여 엑셀 시트로 전달해 주시기 바랍니다.

새로운 알림 항목을 등록하려면 담당자에게 아래 5가지 정보를 작성하여 전달해 주셔야 합니다. 이 정보들은 유저가 보는 설정 화면을 구성하고, 지정된 시간에 알맞은 챗봇 메시지를 발송하는 데 사용됩니다.
챗봇 ID: 알림 등록을 신청하는 챗봇의 ID 입니다.
대상채널: 알림을 등록하고자 하는 채널입니다. (예: 운영채널)
제목: 유저의 알림 설정 화면에 노출되는 알림의 이름입니다. (예: 점심 알림)
설명: 제목 하단에 노출되는 부가 설명으로, 알림의 목적을 안내합니다. (예: 매일 점심 알림을 드릴게요)
시간 고정 여부: 유저가 알림 수신 시간을 직접 수정할 수 있게 허용할지(X), 혹은 정해진 시간에만 일괄 발송할지(O) 결정합니다.
시간 기본값: 유저가 시간을 따로 변경하기 전, 최초로 세팅되어 있는 기본 발송 시간입니다.
알림 주기: 매일
트리거될 블록의 이벤트 이름: 알림 시간이 됐을 때 챗봇에서 실행될 블록의 시스템 이벤트명입니다. 챗봇 빌더(우측 이미지 참고)에 설정된 이벤트 이름과 정확히 일치해야 합니다. (예: lunch_notification)



필드
예시
제목
점심 알림
설명
매일 점심 알림을 드릴게요
시간 고정 여부
X (유저가 설정 가능)
시간 기본값
오전 10:00
알림 주기
매일
트리거될 블록의 이벤트 이름
lunch_notification


특정 조건에서 알림을 발송하지 않는 방법 (예외 처리)
주말이나 공휴일 등 알림 메시지를 발송하고 싶지 않은 상황이 있다면, 이벤트 API 호출에 대한 응답으로 빈 말풍선을 반환해 주시면 됩니다. 아래 예시와 같이 "outputs" 배열을 비워두면 유저에게 메시지가 발송되지 않습니다.
{
    "version": "2.0",
    "template": {
        "outputs": []
    }
}



알림 설정 유도 방법
제공하려는 알림과 연관된 응답 시 봇 설정 바로가기 액션 타입 (settings) 버튼을 제공하여 알림 설정을 유도하거나 신규 기능인 경우 이벤트 API를 사용하여 선톡을 발송하여 설정을 유도할 수 있습니다. 
알림과 연관된 응답 시 설정 버튼 추가하여 유도 동선 예시)

AI 챗봇 콜백 가이드 – 확장 정책 안내
생성형 AI를 활용하는 챗봇은 응답 시간이 길어질 수 있는 특성을 고려해 콜백(Callback) 방식의 비동기 응답 처리 기능을 제공합니다.
그룹 챗봇에는 채널 챗봇과는 다른 확장된 콜백 시간이 적용되며, 세부 정책은 다음과 같습니다.
콜백 URL 유효 시간: 5분 (채널 챗봇의 경우 1분)
콜백 호출 가능 횟수: 1회

그 외 동작 방식 및 사용 규칙은 기존 카카오 콜백 가이드를 참고바랍니다.
▶ 챗봇 공식 도움말 > AI 챗봇 콜백 가이드
이벤트 API 사용하기
사용자가 먼저 챗봇에 대화를 요청하는 것이 아니라 챗봇이 먼저 사용자에게 메시지를 전송하기 위해서는 이벤트 API를 사용해야합니다. 이벤트 API는 알림 및 안내 등의 목적으로 사용할 수 있습니다. 아래 예제에서는 블록에 이벤트 이름을 설정하고 이벤트 API를 통해 메시지를 발송해보겠습니다.
▶ 챗봇 공식 도움말 > 이벤트 API 바로가기

블록에 이벤트 이름 설정
이벤트 API로 챗봇이 사용자에게 먼저 메시지를 보내기 위해서는 어떤 블록을(메시지 내용) 전송할지를 설정해야합니다. 이벤트 API는 블록에 이벤트 이름을 지정하고 해당 블록의 내용을 메시지로 발송할 수 있습니다.
블록에 이벤트 이름을 설정하려면 챗봇 관리자센터 > 주말 Sweet Hour 이벤트 > […](더보기 버튼) > [이벤트 설정] 을 눌러주세요.

그림 7. 이벤트 설정 화면. …(더보기)를 누르고 이벤트 설정을 누름.
이벤트 설정 팝업에서 sweet_hour_event와 같이 이벤트 API에서 사용할 이벤트 이름을 입력한 뒤 엔터를 누르고 [확인] 버튼을 눌러주세요.

그림 8. 이벤트 이름 설정 화면. sweet_hour_event로 이벤트 이름을 지정하는 예시.

이벤트 API 호출
📌참고사항:
이벤트 API 발송을 위한 무료 요금제 등록을 메일(chatbot@kakaocorp.com)로 신청해주세요.
블록에 이벤트 이름 설정이 완료되면, 이벤트 API를 통해 챗봇이 먼저 카카오톡 팀채팅방에 메시지를 전송할 수 있습니다. API 호출 방법은 아래와 같습니다.
curl --request POST \
  --url 'https://bot-api.kakao.com/v2/bots/{botId}/group' \
  --header 'Authorization: KakaoAK {REST API Key}' \
  --header 'Content-Type: application/json' \
  --data '{
	"chat": [
		{
			"id": "9d5c0b531ce5015c54e5dca368236e3fe3613e9297319bf57116860068b5035081",
			"type": "botGroupKey"
		}
	],
	"event": {
		"name": "sweet_hour_event",
		"data": {}
	}
}'

표 6. 이벤트 메시지 발송 API curl 예시.
📌참고사항:
 발송 시, 한번에 최대 100개의 채팅방에 발송할 수 있습니다. 발송 할 방이 100개를 초과하는 경우 여러번 분산해 발송을 해야합니다. Event API

📌참고사항:
운영 채널로 발송 시에는 botId, 개발 채널로 발송 시에는 botId 끝에 !를 붙여서 API를 호출해야합니다.
운영 채널로 Event API 발송 시 : botId (예시. 667e5382f2b2f84cb555091c)
개발 채널로 Event API 발송 시 : botid! (예시. 667e5382f2b2f84cb555091c!)

이벤트 API를 호출하면 아래와 같이 Task ID가 포함된 Response를 받을 수 있습니다. 이 Task ID는 발송 성공 여부를 조회하는데 사용됩니다.
{
	"taskId": "5f767a00-2ac6-408a-865b-be66ede611a2",
	"status": "SUCCESS",
	"timestamp": 1728382106745
}

표 7. 이벤트 메시지 발송 API 호출 결과. taskId는 발송 성공 여부를 조회할 때 사용.

API 호출 결과 카카오톡에서 아래와 같이 챗봇이 먼저 메시지를 전송하는 것을 확인할 수 있습니다.

그림 9. 이벤트 API 호출 결과. 이벤트 이름에 해당하는 블록이 채팅방으로 전송됨.

이벤트 API 결과 조회
위에서 이벤트 API를 호출하면 Task ID를 받을 수 있었습니다. Task ID로 발송 성공 여부를 조회할 수 있습니다. (Task ID: 5f767a00-2ac6-408a-865b-be66ede611a2)
curl --request GET \
  --url https://bot-api.kakao.com/v1/tasks/5f767a00-2ac6-408a-865b-be66ede611a2

표 8. 이벤트 API 결과 조회 Request.
{
	"taskId": "5f767a00-2ac6-408a-865b-be66ede611a2",
	"status": "ALL SUCCESS",
	"allRequestCount": 1,
	"successCount": 1,
	"fail": {
		"count": 0,
		"list": []
	}
}

표 9. 이벤트 API 결과 조회 Response. 전체 발송에 성공했음을 알 수 있음.
 이벤트 API의 상세한 내용은 API - 이벤트 메시지 - 메시지 발송 섹션을 참고해주세요.

URL 링크 버튼 클릭 시 유저 식별자 전달
팀채팅방에서 유저가 챗봇의 URL 링크 버튼을 클릭하면, 유저 식별을 위한 파라미터가 자동으로 URL에 추가되고, 해당 URL은 유저에 의해 호출됩니다. 이를 통해 챗봇은 클릭한 유저를 식별하여 다양한 시나리오를 처리할 수 있습니다.
적용 대상
모든 카드의 일반 버튼
리스트카드 헤더
리스트카드 아이템

전달되는 파라미터
URL 버튼을 클릭하면 아래 3가지 정보가 자동으로 쿼리 파라미터로 전달됩니다
파라미터 이름
설명
botUserKey
챗봇 기준 사용자 ID
appUserId
앱 기준 유저 ID
botGroupKey
채팅방 ID

URL 예시
버튼에 설정한 URL:
http://my-mbti-test.com

유저가 브라우저로 호출하는 URL:
http://my-mbti-test.com?botUserKey=bu1&appUserId=1000&botGroupKey=gk1


설정 방법
블록의 응답 설정에서 버튼에 URL 링크를 설정하면 기능이 동작됩니다.



API 
RESTful API: 챗봇 API는 RESTful API 규격을 지향합니다.
Content Type: application/json 입니다.
Charset: 요청 시 파라미터 및 메시지는 'UTF-8'로 인코딩되어야 합니다. 또한 응답 메시지는 'UTF-8'로 인코딩되어 있습니다.

인증
API 인증 방식은 카카오 디벨로퍼스 앱 키 방식과 앱 키 발급 제한 시 챗봇 키 방식으로 2가지 방식이 있습니다. 상황에 따라 한 가지 방식을 선택합니다.
카카오 디벨로퍼스 앱 키 방식 (사업자인 경우)
API 호출 시 Authorization 헤더가 필요합니다. REST API Key는 봇이 연결된 채널과 해당 채널에 연결된 앱의 키를 사용하며, 카카오 디벨로퍼스에서 확인할 수 있습니다.
이 값을 확인하여 Authorization 헤더를 추가합니다.
Authorization: KakaoAK {REST API Key}



그림 10. 카카오 디벨로퍼스 에서 REST API 키 조회 화면.
앱 키 발급 제한 시 챗봇키 방식 (개인인 경우)
위와 동일하게 API 호출 시 Authorization 헤더가 필요합니다. 카카오 디벨로퍼스 앱 키 발급이 제한된 사용자는 chatbot@kakaocorp.com 메일로 신청하여 별도의 키를 발급받아야 합니다. 
해당 메일을 통해 전달받은 키를 확인하여 Authorization 헤더를 추가합니다. 
Authorization: KakaoBK {REST API Key}


호스트
운영 환경 호스트는 https://bot-api.kakao.com 입니다.

챗봇이 참여하고 있는 채팅방 정보 API
채팅방에서 챗봇이 입장한 방 리스트와 선톡 ON/OFF 여부(챗봇이 event api로 발송한 선톡 메시지를 수신할지 여부 설정)를 조회할 수 있는 API입니다. lastBotGroupKey를 넣지 않고 요청을 넣으면 방 리스트의 첫 번째 페이지를 얻을 수 있습니다. 그리고 hasNext 응답 필드가 true인 경우, lastBotGroupKey 응답 필드를 다음 요청의 파라미터로 입력하면 다음 페이지들을 이어서 조회할 수 있습니다.
엔드포인트
GET /v3/bots/{botId}/group-chat-rooms
파라미터
구분
파라미터 이름
타입
필수 여부
허용 값
설명
Path Variables
botId
String
O
봇 ID 문자열
봇 ID
Query Parameters
pageSize
Integer
X
10, 20, 50, 100
페이지당 결과 수 (기본값 100)


lastBotGroupKey
String
X
응답으로 받은 botGroupKey 문자열
다음 목록을 이어서 가져오기 위한 cursor

인증은 아래 이벤트 메시지와 동일한 인증을 사용합니다. 
Request Header
Authorization: KakaoAK|KakaoBK {Rest Api Key}
Content-Type: application/json
* 해당 rest api key 는 카카오 디벨로퍼스에서 생성한 앱의 앱키 중 REST API 키 로 보내주셔야 합니다.

호출 예시1(첫 번째 페이지 조회)
Request
curl --request GET \
  --url https://bot-api.kakao.com/v3/bots/{botId}/group-chat-rooms?pageSize=2 \
  --header 'Authorization: KakaoAK {REST API Key}' \
  --header 'Content-Type: application/json; charset=utf-8'



Response
{
  "groupChatRooms": [
    {
      "botGroupKey": "3707a5b74cad91e943891fd121a947a69f09d58d2ad8b0e3d458b2f50b3bdb6778",
      "isSubscribed": true
    },
    {
      "botGroupKey": "e6ef2dd9b8c6827c922cd6fe626d7057aaf34c30513e9fedf5e34895c41c1f04ae",
      "isSubscribed": false
    }
  ],
  "hasNext": true,
  "lastBotGroupKey": "e6ef2dd9b8c6827c922cd6fe626d7057aaf34c30513e9fedf5e34895c41c1f04ae"
}

호출 예시2(나머지 페이지 조회)
Request
curl --request GET \
  --url https://bot-api.kakao.com/v3/bots/{botId}/group-chat-rooms?pageSize=2&lastBotGroupKey="e6ef2dd9b8c6827c922cd6fe626d7057aaf34c30513e9fedf5e34895c41c1f04ae" \
  --header 'Authorization: KakaoAK {REST API Key}' \
  --header 'Content-Type: application/json; charset=utf-8'



Response
{
  "groupChatRooms": [
    {
      "botGroupKey": "a835ecab81c5216898af8006ebf38bac722f28d8a0a2019203164f5a5c6c4fa62d",
      "isSubscribed": true
    }
  ],
  "hasNext": false,
  "lastBotGroupKey": "a835ecab81c5216898af8006ebf38bac722f28d8a0a2019203164f5a5c6c4fa62d"
}


채팅방에 참여한 유저 목록 조회 API
채팅방에 참여한 유저의 아이디(botUserKey) 목록을 조회하는 API입니다.
엔드포인트
GET /v2/bots/{botId}/group-chat-rooms/{botGroupKey}/members
파라미터
구분
파라미터 이름
타입
필수 여부
허용 값
설명
Path Variables
botId
String
O
봇 ID
봇을 구분하는 식별자


botGroupKey
String
O
봇 그룹 키
채팅방을 구분하는 식별자

Request Header
Authorization: KakaoAK|KakaoBK {Rest Api Key}
Content-Type: application/json
* 해당 rest api key 는 카카오 디벨로퍼스에서 생성한 앱의 앱키 중 REST API 키 로 보내주셔야 합니다.
호출 예시
Request
curl --request GET \
  --url https://bot-api.kakao.com/v2/bots/{botId}/group-chat-rooms/{botGroupKey}/members \
  --header 'Authorization: KakaoAK {REST API Key}' \
  --header 'Content-Type: application/json; charset=utf-8'



Response
{
	"users": [
"a1fc7855866731b5e40176eb839a905d5966fd0c6bae2c9b177f3fa12cf21dd9ae",	"563ab9a31df87a91c6f0183f216dfef4cbaf71d597ec230e37aefe3192079ea867"
	]
}


이벤트 메시지
메시지 발송
엔드포인트
POST /v2/bots/{botId}/group
파라미터
구분
파라미터 이름
타입
필수 여부
허용 값
설명
Path Variables
botId
String
O
봇 ID 값
봇 ID
Body
chat
Object[]
O






chat.id


O


botGroupKey 값


chat.type


O
botGroupKey
채팅방 식별키 종류


event
Object
O






event.name


O
블록에 등록한 이벤트 이름
챗봇 관리자센터 블록에 등록한 이벤트 이름


event.data


X





Request Header
Authorization: KakaoAK|KakaoBK {Rest Api Key}
Content-Type: application/json
호출 예시
Request
curl --request POST \
  --url 'https://bot-api.kakao.com/v2/bots/{botId}/group' \
  --header 'Authorization: KakaoAK {REST API Key}' \
  --header 'Content-Type: application/json' \
  --data '{
	"chat": [
		{
			"id": "a1fc7855866731b5e40176eb839a905d5966fd0c6bae129b177f3fa12cf21dd9ae",
			"type": "botGroupKey"
		}
	],
	"event": {
		"name": "sweet_hour_event",
		"data": {}
	}
}'




Response
{
	"taskId": "5f767a00-2ac6-408a-865b-be66ede611a2",
	"status": "SUCCESS",
	"timestamp": 1728382106745
}


메시지 발송 성공, 실패 결과 조회
엔드포인트 
GET v1/tasks/{botId}

파라미터
구분
파라미터 이름
타입
필수 여부
허용 값
설명
Path Variables
botId
String
O
봇 ID 값
봇 ID


호출 예시
Request
curl --request GET \
  --url https://bot-api.kakao.com/v1/tasks/bf46deb1-0f4e-4837-96ea-02428d4d691c


Response
예시 1. 1건이 유효하지 않은 UserId인 경우.
{
	"taskId": "bf46deb1-0f4e-4837-96ea-02428d4d691c",
	"status": "1 FAIL",
	"allRequestCount": 2,
	"successCount": 1,
	"userKeyResolvingFailCount": 1,
	"fail": {
		"count": 1,
		"list": []
	}
}



예시 2. 스킬 서버 응답에 문제가 있는 경우.
{
	"taskId": "861f6cd5-c737-417c-bde3-d11f8ed82a49",
	"status": "1 FAIL",
	"allRequestCount": 1,
	"successCount": 0,
	"fail": {
		"count": 1,
		"list": [
			{
				"userId": "9d5c0b531ce5015c54e5dca368236e3fe3613e9297319bf57116860068b5035081",
				"reqUserType": "botGroupKey",
				"createdAt": 1728531719,
				"errorMsg": {
					"errorType": 201,
					"msg": "Bot skill server responded with an HTTP error."
				}
			}
		]
	}
}


추가적인 오류 코드는 아래 챗봇 공식 도움말을 참조해주세요.
▶ 챗봇 공식 도움말 - Event 발송 성공여부 조회

챗봇 테스트 및 문제해결 방법
챗봇 테스트 방법
챗봇은 테스트 채널과 운영 채널이 있으며 챗봇 관리자센터에서 수정한 내용은 개발 채널에 즉시 반영되고, 배포를 하면 운영 채널에 반영됩니다. 사전에 개발 채널에서 충분히 테스트를 한 후 배포하여 주시기 바랍니다. 운영 채널과 개발 채널 설정은 챗봇 관리자센터 > 설정 에서 할 수 있습니다.

그림 11. 운영 채널과 개발 채널 설정 화면.

배포는 챗봇 관리자센터에서 봇을 설계 및 저장한 내용을 실제 서비스에 반영하는 기능입니다. 배포를 하지 않으면 저장한 모든 내용은 운영 채널에 반영되지 않습니다. 개발 채널에서 테스트가 완료된 경우 배포하여 운영 채널에 수정 사항을 반영하면 됩니다.
배포는 챗봇 관리자센터 > 배포 메뉴에서 [배포] 버튼을 눌러 실행할 수 있습니다.

그림 12. 배포 화면. 배포 버튼을 눌러 수정 사항을 운영 채널에 반영할 수 있음

문제해결 방법
카카오톡에서 사용자가 챗봇에게 발화할 때마다, 서버에서는 각 요청에 대해 고유한 Footprint ID를 생성하여 관리합니다. 챗봇 개발 관련 문의나 문제 상황 확인 요청 시, Footprint ID를 함께 전달하면 원인 파악이 더 빠르게 진행될 수 있습니다.
Footprint ID는 카카오톡 채팅방에서 @{봇이름} .showmethebug 를 입력하면 chp로 시작하는 Footprint ID를 확인할 수 있습니다.

그림 13. Footprint ID 확인 방법. @{봇이름} .showmethebug 를 입력하여 확인 가능.

챗봇은 테스트 채널과 운영 채널이 있으며 챗봇 관리자센터에서 수정한 내용은 개발 채널에 즉시 반영되고, 배포를 하면 운영 채널에 반영됩니다. 사전에 개발 채널에서 충분히 테스트를 한 후 배포하여 주시기 바랍니다. 운영 채널과 개발 채널 설정은 챗봇 관리자센터 > 설정 에서 할 수 있습니다.

그림 11. 운영 채널과 개발 채널 설정 화면.

배포는 챗봇 관리자센터에서 봇을 설계 및 저장한 내용을 실제 서비스에 반영하는 기능입니다. 배포를 하지 않으면 저장한 모든 내용은 운영 채널에 반영되지 않습니다. 개발 채널에서 테스트가 완료된 경우 배포하여 운영 채널에 수정 사항을 반영하면 됩니다.
배포는 챗봇 관리자센터 > 배포 메뉴에서 [배포] 버튼을 눌러 실행할 수 있습니다.


변경 이력
버전
변경사항
1.11.1
plusfriendUserKey 유저 식별자 제거
1.11.0
알림 설정 기능 가이드 추가
1.10.1
Webhook 전송 시 Header도 전달 가능하게 개선
1.10.0
버튼 레이아웃이 Vertical인 경우 최대 버튼 개수 5개로 수정
1.9.0
Webhook 및 챗봇 초대하기 URL 추가
1.8.0
인증 방식에 챗봇 키 방식 추가
1.7.0
플러그인 및 파라미터 플러그인 추가
1.6.1
그룹봇 전영 버튼 플러그인 - action 타입 설명 오류 정정
1.6.0
AI 챗봇 콜백 가이드 추가
1.5.0
그룹봇 전용 버튼 플러그인 추가
1.4.0
채팅방에 참여한 유저 목록 조회 API 추가
1.3.0
발화에서 멘션된 유저 식별하기 추가
1.2.0
URL 링크 버튼 클릭 시 유저 식별자 전달
1.1.0
말풍선 응답에 멘션 사용하기 추가
1.0.0
최초 공개
